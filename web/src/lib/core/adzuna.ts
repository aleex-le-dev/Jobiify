import type { DiscoveredOffer, ExploreFilters } from "@/lib/explore";
import { formatLocationCity } from "@/lib/format";
import type { Zone } from "./zone";
import { cacheKey, getEnvVar, readCache, searchKeywords, writeCache } from "./local-area";
import { fitField, matchedField, passesFilters } from "./offer-filter";
import type { SearchContext } from "./search-context";

/**
 * Adzuna (api.adzuna.com) — agrégateur gratuit (clé sur developer.adzuna.com,
 * ~250 req/jour). Il indexe job boards, sites d'intérim et sites carrières PME,
 * ce qui complète bien France Travail. Recherche par ville + rayon autour de la
 * commune de départ du profil.
 */

// Le compte gratuit n'a que 25 appels d'essai au TOTAL : peu de requêtes par
// recherche (1 page, 3 mots-clés au plus) et un cache de 24 h. Avec un forfait
// payant, ADZUNA_MAX_KEYWORDS=12 et ADZUNA_MAX_PAGES=3 rétablissent une recherche large.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface AdzunaRawJob {
  id: string;
  title: string;
  created?: string;
  redirect_url: string;
  latitude?: number;
  longitude?: number;
  contract_time?: string;
  contract_type?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
}

const strip = (s: string) => s.replace(/<[^>]+>/g, "").trim();

export async function fetchAndCacheAdzunaJobs(ctx: SearchContext, positive?: string[]): Promise<AdzunaRawJob[]> {
  const appId = getEnvVar("ADZUNA_APP_ID");
  const appKey = getEnvVar("ADZUNA_APP_KEY");
  if (!appId || !appKey) return [];

  const keywords = searchKeywords(positive, Math.max(1, Number(getEnvVar("ADZUNA_MAX_KEYWORDS")) || 3));
  const maxPages = Math.max(1, Number(getEnvVar("ADZUNA_MAX_PAGES")) || 1);
  const key = cacheKey("adzuna", keywords, ctx.key);
  const cached = readCache<AdzunaRawJob>(key, CACHE_TTL_MS);
  if (cached) return cached;

  const all = new Map<string, AdzunaRawJob>();
  try {
    for (const kw of keywords) {
      for (let page = 1; page <= maxPages; page++) {
        const params = new URLSearchParams({
          app_id: appId,
          app_key: appKey,
          results_per_page: "50",
          what: kw,
          where: [ctx.codePostal, ctx.nom].filter(Boolean).join(" "),
          distance: String(ctx.radiusKm),
          max_days_old: "45",
          sort_by: "date",
          "content-type": "application/json",
        });
        const res = await fetch(`https://api.adzuna.com/v1/api/jobs/fr/search/${page}?${params}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) break;
        const data = (await res.json()) as { results?: AdzunaRawJob[] };
        const results = data.results || [];
        for (const j of results) if (j.id && !all.has(j.id)) all.set(j.id, j);
        if (results.length < 50) break;
      }
    }
  } catch (err) {
    console.error("Adzuna search failed:", err);
  }

  const jobs = Array.from(all.values());
  if (jobs.length) writeCache(key, jobs);
  return jobs;
}

export async function loadAdzunaDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone: Zone | undefined,
  ctx: SearchContext,
): Promise<DiscoveredOffer[]> {
  const raw = await fetchAndCacheAdzunaJobs(ctx, filters.positive);
  const offers: DiscoveredOffer[] = [];

  for (const job of raw) {
    const title = strip(job.title || "");
    if (!title || !job.redirect_url) continue;
    const loc = job.location?.display_name || "";
    if (!passesFilters({ title, location: loc, lat: job.latitude, lon: job.longitude }, filters, zone)) continue;

    offers.push({
      company: strip(job.company?.display_name || "") || "Entreprise non communiquée",
      title,
      location: formatLocationCity(loc) || loc || "Lieu non précisé",
      postedAt: job.created || "",
      ats: "portals",
      source: "adzuna",
      url: job.redirect_url,
      matchedKeyword: matchedField(title, filters),
      ...fitField(title, roleTargets),
    });
  }
  return offers;
}
