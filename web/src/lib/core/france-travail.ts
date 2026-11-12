import type { DiscoveredOffer, ExploreFilters } from "@/lib/explore";
import { formatLocationCity } from "@/lib/format";
import { titlePasses } from "@/lib/offer-match.mjs";
import type { Zone } from "./zone";
import { cacheKey, getEnvVar, readCache, searchKeywords, writeCache } from "./local-area";
import { fitField, matchedField, passesFilters, pause } from "./offer-filter";
import type { SearchContext } from "./search-context";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 heures
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";

interface FtRawJob {
  id: string;
  intitule: string;
  description?: string;
  dateCreation?: string;
  dateActualisation?: string;
  romeCode?: string;
  romeLibelle?: string;
  appellationlibelle?: string;
  typeContrat?: string;
  typeContratLibelle?: string;
  lieuTravail?: {
    libelle?: string;
    codePostal?: string;
    commune?: string;
    latitude?: number;
    longitude?: number;
  };
  entreprise?: {
    nom?: string;
  };
  origineOffre?: {
    urlOrigine?: string;
    partenaires?: Array<{ nom?: string; url?: string }>;
  };
  /** Ajouté par Jobiify : offre remontée par son code métier (ROME), pas par un mot-clé. */
  viaRome?: boolean;
}

let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (cachedToken && cachedToken.expires_at > Date.now() + 60_000) {
    return cachedToken.access_token;
  }

  try {
    const tokenUrl = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "api_offresdemploiv2 o2dsoffre",
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      console.warn("France Travail OAuth2 failed with status", res.status);
      return null;
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in || 1499) * 1000,
    };
    return cachedToken.access_token;
  } catch (err) {
    console.error("France Travail OAuth error:", err);
    return null;
  }
}

/** Paramètres de lieu : commune + rayon quand le code INSEE est connu, sinon départements. */
function placeParams(ctx: SearchContext, minRadius = 0): Record<string, string> {
  if (ctx.insee) return { commune: ctx.insee, distance: String(Math.max(ctx.radiusKm, minRadius)) };
  return { departement: ctx.departements.slice(0, 5).join(",") };
}

/** Une recherche paginée (150 offres par page, jusqu'à `max`). */
async function searchPaged(token: string, base: Record<string, string>, max: number, into: Map<string, FtRawJob>, mark?: (j: FtRawJob) => void) {
  const PAGE = 150;
  for (let start = 0; start < max; start += PAGE) {
    const params = new URLSearchParams({ ...base, range: `${start}-${start + PAGE - 1}`, sort: "1" });
    const res = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 204 || !res.ok) break; // 200 et 206 sont valides
    const data = (await res.json()) as { resultats?: FtRawJob[] };
    const page = data.resultats || [];
    for (const item of page) {
      if (!item.id || into.has(item.id)) continue;
      mark?.(item);
      into.set(item.id, item);
    }
    if (page.length < PAGE) break;
    await pause(120); // quota : ~10 req/s
  }
}

/**
 * Recherche France Travail autour de la commune de départ du profil. Inclut les
 * offres des partenaires (HelloWork, Indeed, Meteojob, agences d'intérim…).
 *
 * Deux passes pour ne rien laisser passer :
 *  1. par mots-clés (postes du profil + synonymes, jusqu'à 600 offres chacun) ;
 *  2. par code métier ROME : les codes des offres trouvées en 1 dont le TITRE
 *     correspond au profil sont réinterrogés sans mot-clé. On récupère ainsi les
 *     offres du même métier publiées sous un intitulé que personne n'avait prévu.
 */
export async function fetchAndCacheFranceTravailJobs(ctx: SearchContext, positive?: string[]): Promise<FtRawJob[]> {
  const clientId = getEnvVar("FRANCETRAVAIL_CLIENT_ID");
  const clientSecret = getEnvVar("FRANCETRAVAIL_CLIENT_SECRET");
  if (!clientId || !clientSecret) return [];

  const keywords = searchKeywords(positive, 20);
  const key = cacheKey("france-travail", keywords, ctx.key);
  const cached = readCache<FtRawJob>(key, CACHE_TTL_MS);
  if (cached) return cached;

  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return [];

  const allJobs = new Map<string, FtRawJob>();
  const place = placeParams(ctx);
  try {
    for (const kw of keywords) await searchPaged(token, { ...place, motsCles: kw }, 600, allJobs);

    // Passe 2 : codes ROME dominants parmi les offres dont le titre correspond au profil.
    if (positive && positive.length > 0) {
      const romeCount = new Map<string, number>();
      let matched = 0;
      for (const j of allJobs.values()) {
        if (!j.romeCode || !titlePasses(j.intitule, { positive })) continue;
        matched++;
        romeCount.set(j.romeCode, (romeCount.get(j.romeCode) || 0) + 1);
      }
      const romes = [...romeCount.entries()]
        .filter(([, n]) => n >= 2 && n / matched >= 0.12)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([code]) => code);
      if (romes.length) {
        await searchPaged(token, { ...place, codeROME: romes.join(",") }, 900, allJobs, (j) => {
          j.viaRome = true;
        });
      }
    }
  } catch (err) {
    console.error("France Travail search failed:", err);
  }

  const jobs = Array.from(allJobs.values());
  if (jobs.length) writeCache(key, jobs);
  return jobs;
}

export function ftOfferUrl(job: FtRawJob): string {
  return (
    job.origineOffre?.partenaires?.[0]?.url ||
    job.origineOffre?.urlOrigine ||
    `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(job.id)}`
  );
}

export async function loadFranceTravailDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone: Zone | undefined,
  ctx: SearchContext,
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheFranceTravailJobs(ctx, filters.positive);
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    const loc = job.lieuTravail?.libelle || job.lieuTravail?.commune || "";
    const candidate = {
      title: job.intitule,
      location: loc,
      lat: job.lieuTravail?.latitude,
      lon: job.lieuTravail?.longitude,
      codeInsee: job.lieuTravail?.commune,
    };
    const byTitle = passesFilters(candidate, filters, zone);
    // Offre du même métier (ROME) sous un autre intitulé : gardée, et signalée comme telle.
    const byRome = !byTitle && job.viaRome === true && passesFilters(candidate, filters, zone, { skipPositive: true });
    if (!byTitle && !byRome) continue;

    const contrat = job.typeContratLibelle || "";
    const notes = [byRome && job.romeLibelle ? `Même métier : ${job.romeLibelle}` : "", contrat].filter(Boolean);
    offers.push({
      company: job.entreprise?.nom || "Employeur non communiqué",
      title: job.intitule,
      location: formatLocationCity(loc) || loc || "Lieu non précisé",
      postedAt: job.dateActualisation || job.dateCreation || "",
      ats: "portals",
      source: "france-travail",
      url: ftOfferUrl(job),
      matchedKeyword: matchedField(job.intitule, filters),
      ...(notes.length ? { note: notes.join(" · ") } : {}),
      ...fitField(job.intitule, roleTargets),
    });
  }

  return offers;
}

export type { FtRawJob };

/**
 * Missions d'intérim (typeContrat=MIS) autour du point de départ, TOUS métiers.
 * France Travail reçoit les offres de la plupart des agences (Adecco, Manpower,
 * Proman, Crit, Start People, Samsic…) : c'est la source la plus complète pour
 * l'intérim. Pagination jusqu'à 1 500 missions, cache 1 h.
 */
export async function fetchFranceTravailInterim(ctx: SearchContext): Promise<FtRawJob[] | null> {
  const clientId = getEnvVar("FRANCETRAVAIL_CLIENT_ID");
  const clientSecret = getEnvVar("FRANCETRAVAIL_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null; // null = clé absente

  const key = `france-travail-interim-${ctx.key}`;
  const cached = readCache<FtRawJob>(key, 60 * 60 * 1000);
  if (cached) return cached;

  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return [];
  const all = new Map<string, FtRawJob>();
  try {
    await searchPaged(token, { ...placeParams(ctx, 40), typeContrat: "MIS" }, 1500, all);
  } catch (err) {
    console.error("France Travail (intérim) search failed:", err);
  }
  const jobs = Array.from(all.values());
  if (jobs.length) writeCache(key, jobs);
  return jobs;
}
