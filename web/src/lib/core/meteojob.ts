import type { DiscoveredOffer, ExploreFilters } from "@/lib/explore";
import type { Zone } from "./zone";
import { cacheKey, readCache, searchKeywords, writeCache } from "./local-area";
import { fitField, matchedField, passesFilters, pause } from "./offer-filter";
import type { SearchContext } from "./search-context";
import { parseMeteojobPage } from "@/lib/meteojob-parse.mjs";

type MeteojobRawJob = ReturnType<typeof parseMeteojobPage>["jobs"][number];

/**
 * Meteojob — job board généraliste, très fourni en intérim (Adecco, Synergie,
 * Aquila RH, RAS…) et en CDI/CDD de PME. Aucune clé : la page de recherche
 * publique (/jobs?…, explicitement autorisée par son robots.txt) embarque ses
 * résultats en JSON, avec les coordonnées GPS de chaque offre.
 *
 * Usage volontairement mesuré : peu de pages par mot-clé, une pause entre deux
 * requêtes, et un cache disque de 6 h partagé par toutes les recherches.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PAGE_SIZE = 20;
const UA = "Mozilla/5.0 (compatible; Jobiify/1.0; recherche d'emploi personnelle)";

export type { MeteojobRawJob };

async function fetchPages(query: Record<string, string>, ctx: SearchContext, maxPages: number, into: Map<string, MeteojobRawJob>) {
  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      ...query,
      where: ctx.codePostal ? `${ctx.nom} (${ctx.codePostal})` : ctx.nom,
      radius: String(Math.min(ctx.radiusKm, 100)),
      sorting: "DATE",
      ...(page > 1 ? { page: String(page) } : {}),
    });
    const res = await fetch(`https://www.meteojob.com/jobs?${params}`, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) break;
    const { total, jobs } = parseMeteojobPage(await res.text());
    for (const j of jobs) if (!into.has(j.id)) into.set(j.id, j);
    if (jobs.length < PAGE_SIZE || page * PAGE_SIZE >= total) break;
    await pause(350);
  }
}

/** Offres Meteojob pour les postes d'un profil, autour de sa commune de départ. */
export async function fetchAndCacheMeteojobJobs(ctx: SearchContext, positive?: string[]): Promise<MeteojobRawJob[]> {
  const keywords = searchKeywords(positive, 8);
  const key = cacheKey("meteojob", keywords, ctx.key);
  const cached = readCache<MeteojobRawJob>(key, CACHE_TTL_MS);
  if (cached) return cached;

  const all = new Map<string, MeteojobRawJob>();
  try {
    for (const kw of keywords) {
      await fetchPages({ what: kw }, ctx, 4, all);
      await pause(350);
    }
  } catch (err) {
    console.error("Meteojob search failed:", err);
  }
  const jobs = Array.from(all.values());
  if (jobs.length) writeCache(key, jobs);
  return jobs;
}

/** Missions d'intérim Meteojob autour de la commune de départ, tous métiers (les 300 plus récentes). */
export async function fetchMeteojobInterim(ctx: SearchContext): Promise<MeteojobRawJob[]> {
  const key = `meteojob-interim-${ctx.key}`;
  const cached = readCache<MeteojobRawJob>(key, 2 * 60 * 60 * 1000);
  if (cached) return cached;
  const all = new Map<string, MeteojobRawJob>();
  try {
    await fetchPages({ contracts: "INTERIM" }, ctx, 15, all);
  } catch (err) {
    console.error("Meteojob (intérim) search failed:", err);
  }
  const jobs = Array.from(all.values());
  if (jobs.length) writeCache(key, jobs);
  return jobs;
}

export const meteojobUrl = (id: string) => `https://www.meteojob.com/jobs/${encodeURIComponent(id)}`;

const CONTRACT_LABEL: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  INTERIM: "Intérim",
  APPRENTICE: "Alternance",
  TRAINING: "Stage",
  FREELANCE: "Indépendant",
};
export const meteojobContract = (j: MeteojobRawJob) => j.contracts.map((c) => CONTRACT_LABEL[c] || "").filter(Boolean).join(" / ");

export async function loadMeteojobDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone: Zone | undefined,
  ctx: SearchContext,
): Promise<DiscoveredOffer[]> {
  const raw = await fetchAndCacheMeteojobJobs(ctx, filters.positive);
  const offers: DiscoveredOffer[] = [];
  for (const job of raw) {
    if (!passesFilters({ title: job.title, location: job.locality, lat: job.lat, lon: job.lon }, filters, zone)) continue;
    const contract = meteojobContract(job);
    offers.push({
      company: job.company || "Entreprise non communiquée",
      title: job.title,
      location: job.locality,
      postedAt: job.publicationDate,
      ats: "portals",
      source: "meteojob",
      url: meteojobUrl(job.id),
      matchedKeyword: matchedField(job.title, filters),
      ...(contract ? { note: contract } : {}),
      ...fitField(job.title, roleTargets),
    });
  }
  return offers;
}
