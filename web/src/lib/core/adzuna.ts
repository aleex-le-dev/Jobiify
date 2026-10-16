import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { titleFit } from "@/lib/title-fit.mjs";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 heures

interface AdzunaRawJob {
  id: string;
  title: string;
  description?: string;
  created?: string;
  redirect_url: string;
  location?: {
    display_name?: string;
    area?: string[];
  };
  company?: {
    display_name?: string;
  };
}

export async function fetchAndCacheAdzunaJobs(): Promise<AdzunaRawJob[]> {
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey) {
    return [];
  }

  const cacheDir = path.join(careerOpsRoot(), "data", "cache");
  const cacheFile = path.join(cacheDir, "adzuna-62.json");

  try {
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        const raw = fs.readFileSync(cacheFile, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as AdzunaRawJob[];
        }
      }
    }
  } catch {
    /* fallback to live fetch */
  }

  try {
    const keywords = ["informatique", "technicien", "support", "developpeur", "reseau"];
    const allJobs = new Map<string, AdzunaRawJob>();

    for (const kw of keywords) {
      const url = `https://api.adzuna.com/v1/api/jobs/fr/search/1?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&what=${encodeURIComponent(kw)}&where=Pas-de-Calais&results_per_page=50`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) continue;

      const data = (await res.json()) as { results?: AdzunaRawJob[] };
      for (const item of data.results || []) {
        if (item.id && !allJobs.has(item.id)) {
          allJobs.set(item.id, item);
        }
      }
    }

    const jobs = Array.from(allJobs.values());
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cacheFile, JSON.stringify(jobs, null, 2), "utf8");
    return jobs;
  } catch (err) {
    console.error("Adzuna search failed:", err);
    return [];
  }
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
  return text.toLowerCase().includes(kw.toLowerCase().trim());
}

function matchesFilters(title: string, location: string, filters: ExploreFilters): boolean {
  if (filters.negative.some((n) => n && matchesKeyword(title, n))) return false;
  if (filters.positive.length > 0 && !filters.positive.some((p) => p && matchesKeyword(title, p))) return false;

  const fullLoc = location.toLowerCase();
  if (filters.blockHard.some((b) => b && matchesKeyword(fullLoc, b))) return false;
  if (filters.block.some((b) => b && matchesKeyword(fullLoc, b))) return false;
  if (filters.allow.length > 0 && !filters.allow.some((a) => a && matchesKeyword(fullLoc, a))) return false;

  return true;
}

export async function loadAdzunaDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheAdzunaJobs();
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    const loc = job.location?.display_name || "Pas-de-Calais (62)";
    if (!matchesFilters(job.title, loc, filters)) continue;

    offers.push({
      company: job.company?.display_name || "Employeur Adzuna",
      title: job.title.replace(/<[^>]*>?/gm, ""), // Retirer d'éventuelles balises <strong> Adzuna
      location: loc,
      postedAt: (job.created || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      ats: "portals",
      source: "adzuna-fr",
      url: job.redirect_url,
      matchedKeyword: firstMatch(job.title, filters.positive),
      ...fitField(job.title, roleTargets),
    });
  }

  return offers;
}
