import type { DiscoveredOffer, ExploreFilters } from "@/lib/explore";
import type { Zone } from "./zone";
import { cacheKey, getEnvVar, readCache, searchKeywords, writeCache } from "./local-area";
import { fitField, matchedField, passesFilters } from "./offer-filter";
import type { SearchContext } from "./search-context";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 heures

interface JoobleRawJob {
  id: string;
  title: string;
  location?: string;
  snippet?: string;
  salary?: string;
  source?: string;
  type?: string;
  link: string;
  company?: string;
  updated?: string;
}

/** Chaque mot-clé autour des villes principales de la zone du profil, rayon 40 km. */
export async function fetchAndCacheJoobleJobs(ctx: SearchContext, positive?: string[]): Promise<JoobleRawJob[]> {
  const apiKey = getEnvVar("JOOBLE_API_KEY");
  if (!apiKey) return [];

  const keywords = searchKeywords(positive, 8);
  const key = cacheKey("jooble", keywords, ctx.key);
  const cached = readCache<JoobleRawJob>(key, CACHE_TTL_MS);
  if (cached) return cached;

  const allJobs = new Map<string, JoobleRawJob>();
  try {
    const queries = keywords.flatMap((kw) => ctx.anchors.slice(0, 3).map((city) => ({ kw, loc: `${city}, France` })));
    for (const q of queries) {
      for (let page = 1; page <= 3; page++) {
        const res = await fetch(`https://jooble.org/api/${encodeURIComponent(apiKey)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ keywords: q.kw, location: q.loc, radius: "40", page }),
        });
        if (!res.ok) break;
        const data = (await res.json()) as { jobs?: JoobleRawJob[] };
        const fetched = data.jobs || [];
        for (const item of fetched) if (item.link && !allJobs.has(item.link)) allJobs.set(item.link, item);
        if (fetched.length < 20) break; // dernière page
      }
    }
  } catch (err) {
    console.error("Jooble search failed:", err);
  }

  const jobs = Array.from(allJobs.values());
  if (jobs.length) writeCache(key, jobs);
  return jobs;
}

const VAGUE_PLACE = /^(france|hauts[- ]de[- ]france|nord[- ]pas[- ]de[- ]calais|pas[- ]de[- ]calais|nord|somme)$/i;

/** Lieu de l'offre : celui de Jooble s'il est précis, sinon une ville de la zone citée dans l'annonce. */
function resolveLocation(job: JoobleRawJob, ctx: SearchContext): string {
  const loc = (job.location || "").trim();
  if (loc && !VAGUE_PLACE.test(loc.split(",")[0].trim())) return loc;
  const snippet = (job.snippet || "").toLowerCase();
  const named = ctx.anchors.find((city) => new RegExp(`(^|[^a-zà-ÿ])${city.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zà-ÿ]|$)`).test(snippet));
  return named || loc; // lieu vague : la zone de trajet l'écartera
}

export async function loadJoobleDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone: Zone | undefined,
  ctx: SearchContext,
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheJoobleJobs(ctx, filters.positive);
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    const title = (job.title || "").replace(/<[^>]*>?/gm, "").trim();
    const loc = resolveLocation(job, ctx);
    if (!passesFilters({ title, location: loc }, filters, zone)) continue;
    offers.push({
      company: job.company || "Entreprise non communiquée",
      title,
      location: loc,
      postedAt: job.updated || "",
      ats: "portals",
      source: "jooble-pme",
      url: job.link,
      matchedKeyword: matchedField(title, filters),
      ...fitField(title, roleTargets),
    });
  }

  return offers;
}
