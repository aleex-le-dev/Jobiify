import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { formatLocationCity } from "@/lib/format";
import { titleFit } from "@/lib/title-fit.mjs";
import { acceptInZone, type Zone } from "./zone";
import { ORIGIN, cacheKey, getEnvVar, radiusKm, readCache, searchKeywords, writeCache } from "./local-area";

/**
 * Adzuna (api.adzuna.com) — agrégateur gratuit (clé sur developer.adzuna.com,
 * ~250 req/jour). Il indexe job boards, sites d'intérim et sites carrières PME,
 * ce qui complète bien France Travail. Recherche par ville + rayon autour de Lillers.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface AdzunaRawJob {
  id: string;
  title: string;
  created?: string;
  redirect_url: string;
  latitude?: number;
  longitude?: number;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
}

const strip = (s: string) => s.replace(/<[^>]+>/g, "").trim();

export async function fetchAndCacheAdzunaJobs(positive?: string[]): Promise<AdzunaRawJob[]> {
  const appId = getEnvVar("ADZUNA_APP_ID");
  const appKey = getEnvVar("ADZUNA_APP_KEY");
  if (!appId || !appKey) return [];

  const keywords = searchKeywords(positive, 12);
  const key = cacheKey("adzuna", keywords);
  const cached = readCache<AdzunaRawJob>(key, CACHE_TTL_MS);
  if (cached) return cached;

  const all = new Map<string, AdzunaRawJob>();
  try {
    for (const kw of keywords) {
      for (let page = 1; page <= 3; page++) {
        const params = new URLSearchParams({
          app_id: appId,
          app_key: appKey,
          results_per_page: "50",
          what: kw,
          where: `${ORIGIN.codePostal} Lillers`,
          distance: String(radiusKm()),
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

function matchesKeyword(text: string, kw: string): boolean {
  const k = kw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!k) return false;
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (k.length <= 3) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9à-ÿ])${esc}([^a-z0-9à-ÿ]|$)`, "i").test(t);
  }
  return t.includes(k);
}

function fitField(title: string, targets: string[]): { fit: { band: FitBand; score: number } } | Record<string, never> {
  const f = titleFit(title, targets);
  return f ? { fit: { band: f.band as FitBand, score: f.score } } : {};
}

export async function loadAdzunaDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone?: Zone,
): Promise<DiscoveredOffer[]> {
  const raw = await fetchAndCacheAdzunaJobs(filters.positive);
  const offers: DiscoveredOffer[] = [];

  for (const job of raw) {
    const title = strip(job.title || "");
    if (!title || !job.redirect_url) continue;
    if (filters.negative.some((n) => n && matchesKeyword(title, n))) continue;
    if (filters.positive.length > 0 && !filters.positive.some((p) => p && matchesKeyword(title, p))) continue;

    const loc = job.location?.display_name || "Hauts-de-France";
    const lowLoc = loc.toLowerCase();
    if ([...(filters.blockHard || []), ...(filters.block || [])].some((b) => b && matchesKeyword(lowLoc, b))) continue;
    if (filters.remoteOnly && !/t[ée]l[ée]travail|remote/i.test(title + " " + loc)) continue;

    if (zone && !filters.remoteOnly) {
      if (!acceptInZone({ lat: job.latitude, lon: job.longitude, ville: loc, texte: title }, zone)) continue;
    }

    offers.push({
      company: strip(job.company?.display_name || "") || "Entreprise non communiquée",
      title,
      location: formatLocationCity(loc) || loc,
      postedAt: job.created || "",
      ats: "portals",
      source: "adzuna",
      url: job.redirect_url,
      matchedKeyword: filters.positive.find((p) => p && title.toLowerCase().includes(p.toLowerCase())),
      ...fitField(title, roleTargets),
    });
  }
  return offers;
}
