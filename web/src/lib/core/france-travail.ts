import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { formatLocationCity, normalizeDateToIso } from "@/lib/format";
import { titleFit } from "@/lib/title-fit.mjs";
import { acceptInZone, type Zone } from "./zone";
import { ORIGIN, cacheKey, getEnvVar, radiusKm, readCache, searchKeywords, writeCache } from "./local-area";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 heures

interface FtRawJob {
  id: string;
  intitule: string;
  description?: string;
  dateCreation?: string;
  dateActualisation?: string;
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

/**
 * Recherche France Travail autour de Lières (commune INSEE + rayon), ce qui couvre
 * le 62 ET le Nord (59) voisin. Inclut les offres des partenaires (HelloWork,
 * Indeed, Meteojob, agences d'intérim…). Pagination jusqu'à 600 offres par mot-clé.
 */
export async function fetchAndCacheFranceTravailJobs(positive?: string[]): Promise<FtRawJob[]> {
  const clientId = getEnvVar("FRANCETRAVAIL_CLIENT_ID");
  const clientSecret = getEnvVar("FRANCETRAVAIL_CLIENT_SECRET");
  if (!clientId || !clientSecret) return [];

  const keywords = searchKeywords(positive, 15);
  const key = cacheKey("france-travail", keywords);
  const cached = readCache<FtRawJob>(key, CACHE_TTL_MS);
  if (cached) return cached;

  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return [];

  const allJobs = new Map<string, FtRawJob>();
  const PAGE = 150;
  const MAX_PER_KEYWORD = 600;
  try {
    for (const kw of keywords) {
      for (let start = 0; start < MAX_PER_KEYWORD; start += PAGE) {
        const params = new URLSearchParams({
          motsCles: kw,
          commune: ORIGIN.insee,
          distance: String(radiusKm()),
          range: `${start}-${start + PAGE - 1}`,
          sort: "1",
        });
        const res = await fetch(`https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?${params}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (res.status === 204 || !res.ok) break; // 200 et 206 sont valides
        const data = (await res.json()) as { resultats?: FtRawJob[] };
        const page = data.resultats || [];
        for (const item of page) if (item.id && !allJobs.has(item.id)) allJobs.set(item.id, item);
        if (page.length < PAGE) break;
        await new Promise((r) => setTimeout(r, 120)); // quota : ~10 req/s
      }
    }
  } catch (err) {
    console.error("France Travail search failed:", err);
  }

  const jobs = Array.from(allJobs.values());
  if (jobs.length) writeCache(key, jobs);
  return jobs;
}

function firstMatch(title: string, positives: string[]): string | undefined {
  const lower = title.toLowerCase();
  for (const k of positives) if (k && lower.includes(k.toLowerCase())) return k;
  return undefined;
}

function fitField(title: string, targets: string[]): { fit: { band: FitBand; score: number } } | Record<string, never> {
  const f = titleFit(title, targets);
  return f ? { fit: { band: f.band as FitBand, score: f.score } } : {};
}

function matchesKeyword(text: string, kw: string): boolean {
  const cleanKw = kw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!cleanKw) return false;
  const cleanText = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (cleanKw.length <= 3) {
    const escaped = cleanKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(`(^|[^a-z0-9à-ÿ])${escaped}([^a-z0-9à-ÿ]|$)`, "i");
    return rx.test(cleanText);
  }
  return cleanText.includes(cleanKw);
}

function isBlockedLocation(location: string, blockList?: string[]): boolean {
  if (!blockList || blockList.length === 0) return false;
  const locWithoutDept = location.toLowerCase().replace(/\bpas[- ]de[- ]calais\b/g, "").trim();
  return blockList.some((b) => {
    if (!b) return false;
    const cleanB = b.toLowerCase().trim();
    if (cleanB === "calais") {
      return /\bcalais\b/i.test(locWithoutDept);
    }
    return matchesKeyword(locWithoutDept, b);
  });
}

function matchesFilters(
  title: string,
  location: string,
  filters: ExploreFilters,
  job?: FtRawJob,
  zone?: Zone,
): boolean {
  if (filters.negative.some((n) => n && matchesKeyword(title, n))) return false;
  if (filters.positive.length > 0 && !filters.positive.some((p) => p && matchesKeyword(title, p))) return false;

  const fullLoc = location.toLowerCase();
  if (isBlockedLocation(fullLoc, filters.blockHard)) return false;
  if (isBlockedLocation(fullLoc, filters.block)) return false;

  if (filters.remoteOnly) {
    const isRemote = fullLoc.includes("100% télétravail") || fullLoc.includes("remote");
    if (!isRemote) return false;
    return true;
  }

  if (zone) {
    // Zone de trajet active : elle seule décide (la liste "allow" ne peut plus la contourner).
    return acceptInZone(
      {
        lat: job?.lieuTravail?.latitude,
        lon: job?.lieuTravail?.longitude,
        codeInsee: job?.lieuTravail?.commune,
        ville: job?.lieuTravail?.libelle || location,
        texte: title,
      },
      zone,
    );
  }

  if (filters.allow.length > 0 && !filters.allow.some((a) => a && matchesKeyword(fullLoc, a))) return false;

  return true;
}

export async function loadFranceTravailDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone?: Zone,
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheFranceTravailJobs(filters.positive);
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    const loc = job.lieuTravail?.libelle || job.lieuTravail?.commune || "Hauts-de-France";
    if (!matchesFilters(job.intitule, loc, filters, job, zone)) continue;

    const partnerUrl = job.origineOffre?.partenaires?.[0]?.url;
    const originUrl = job.origineOffre?.urlOrigine;
    const directUrl = `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(job.id)}`;
    const finalUrl = partnerUrl || originUrl || directUrl;

    const cleanCity = formatLocationCity(loc) || loc;
    const rawDate = job.dateActualisation || job.dateCreation || "";
    const postedAt = rawDate || "";

    offers.push({
      company: job.entreprise?.nom || "France Travail (Employeur confidentiel)",
      title: job.intitule,
      location: cleanCity,
      postedAt,
      ats: "portals",
      source: "france-travail",
      url: finalUrl,
      matchedKeyword: firstMatch(job.intitule, filters.positive),
      ...fitField(job.intitule, roleTargets),
    });
  }

  return offers;
}
