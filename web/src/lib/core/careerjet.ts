import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { formatLocationCity } from "@/lib/format";
import { titleFit } from "@/lib/title-fit.mjs";
import { acceptInZone, type Zone } from "./zone";
import { ANCHOR_CITIES, cacheKey, getEnvVar, readCache, searchKeywords, writeCache } from "./local-area";

/**
 * Careerjet / Optioncarrière — API publique officielle (public.api.careerjet.net).
 * Identifiant partenaire gratuit (CAREERJET_AFFID) à créer sur careerjet.fr → « Partenaires ».
 * Careerjet agrège des milliers de sites (job boards, intérim, sites carrières).
 * L'API exige un en-tête Referer ainsi que user_ip / user_agent de l'utilisateur final.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface CareerjetRawJob {
  url: string;
  title: string;
  company?: string;
  locations?: string;
  date?: string;
  site?: string;
}

const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

export async function fetchAndCacheCareerjetJobs(positive?: string[]): Promise<CareerjetRawJob[]> {
  const affid = getEnvVar("CAREERJET_AFFID");
  if (!affid) return [];

  const keywords = searchKeywords(positive, 8);
  const key = cacheKey("careerjet", keywords);
  const cached = readCache<CareerjetRawJob>(key, CACHE_TTL_MS);
  if (cached) return cached;

  const all = new Map<string, CareerjetRawJob>();
  try {
    // Careerjet cherche par ville : on interroge les villes d'ancrage de la zone.
    for (const kw of keywords) {
      for (const city of ANCHOR_CITIES.slice(0, 3)) {
        const params = new URLSearchParams({
          locale_code: "fr_FR",
          keywords: kw,
          location: city,
          sort: "date",
          pagesize: "99",
          page: "1",
          affid,
          user_ip: "127.0.0.1",
          user_agent: "jobiify/1.0",
        });
        const res = await fetch(`http://public.api.careerjet.net/search?${params}`, {
          headers: { Accept: "application/json", Referer: "http://localhost/jobiify" },
        });
        if (!res.ok) continue;
        const data = (await res.json()) as { type?: string; jobs?: CareerjetRawJob[] };
        if (data.type !== "JOBS") continue;
        for (const j of data.jobs || []) if (j.url && !all.has(j.url)) all.set(j.url, j);
      }
    }
  } catch (err) {
    console.error("Careerjet search failed:", err);
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

export async function loadCareerjetDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone?: Zone,
): Promise<DiscoveredOffer[]> {
  const raw = await fetchAndCacheCareerjetJobs(filters.positive);
  const offers: DiscoveredOffer[] = [];

  for (const job of raw) {
    const title = strip(job.title || "");
    if (!title || !job.url) continue;
    if (filters.negative.some((n) => n && matchesKeyword(title, n))) continue;
    if (filters.positive.length > 0 && !filters.positive.some((p) => p && matchesKeyword(title, p))) continue;

    const loc = strip(job.locations || "");
    if ([...(filters.blockHard || []), ...(filters.block || [])].some((b) => b && matchesKeyword(loc.toLowerCase(), b))) continue;
    if (filters.remoteOnly && !/t[ée]l[ée]travail|remote/i.test(`${title} ${loc}`)) continue;
    if (zone && !filters.remoteOnly && !acceptInZone({ ville: loc, texte: title }, zone)) continue;

    const parsed = job.date ? new Date(job.date) : null;
    offers.push({
      company: strip(job.company || "") || job.site || "Entreprise non communiquée",
      title,
      location: formatLocationCity(loc) || loc,
      postedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : "",
      ats: "portals",
      source: "careerjet",
      url: job.url,
      matchedKeyword: filters.positive.find((p) => p && title.toLowerCase().includes(p.toLowerCase())),
      ...fitField(title, roleTargets),
    });
  }
  return offers;
}
