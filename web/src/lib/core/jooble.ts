import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { titleFit } from "@/lib/title-fit.mjs";

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

export async function fetchAndCacheJoobleJobs(): Promise<JoobleRawJob[]> {
  const apiKey = process.env.JOOBLE_API_KEY?.trim();
  if (!apiKey) {
    return [];
  }

  const cacheDir = path.join(careerOpsRoot(), "data", "cache");
  const cacheFile = path.join(cacheDir, "jooble-62.json");

  try {
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        const raw = fs.readFileSync(cacheFile, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as JoobleRawJob[];
        }
      }
    }
  } catch {
    /* fallback to live fetch */
  }

  try {
    const keywords = ["informatique", "technicien support", "developpeur", "reseau"];
    const allJobs = new Map<string, JoobleRawJob>();

    for (const kw of keywords) {
      const url = `https://fr.jooble.org/api/${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          keywords: kw,
          location: "Pas-de-Calais",
          page: 1,
        }),
      });

      if (!res.ok) continue;

      const data = (await res.json()) as { jobs?: JoobleRawJob[] };
      for (const item of data.jobs || []) {
        if (item.link && !allJobs.has(item.link)) {
          allJobs.set(item.link, item);
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
    console.error("Jooble search failed:", err);
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

export async function loadJoobleDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheJoobleJobs();
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    const loc = job.location || "Pas-de-Calais (62)";
    if (!matchesFilters(job.title, loc, filters)) continue;

    offers.push({
      company: job.company || "Entreprise / PME (via Jooble)",
      title: job.title.replace(/<[^>]*>?/gm, ""), // Retirer d'éventuelles balises
      location: loc,
      postedAt: (job.updated || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      ats: "portals",
      source: "jooble-pme",
      url: job.link,
      matchedKeyword: firstMatch(job.title, filters.positive),
      ...fitField(job.title, roleTargets),
    });
  }

  return offers;
}
