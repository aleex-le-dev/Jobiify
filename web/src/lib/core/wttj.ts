import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { titleFit } from "@/lib/title-fit.mjs";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

interface WttjJob {
  title: string;
  url: string;
  company: string;
  location: string;
  postedAt?: string;
}

function parseEnvPayload(text: string): { appId: string; apiKey: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("wttj: /api/env payload has no JSON object");
  const env = JSON.parse(text.slice(start, end + 1));
  const appId = typeof env.PUBLIC_ALGOLIA_APPLICATION_ID === "string" ? env.PUBLIC_ALGOLIA_APPLICATION_ID.trim() : "";
  const apiKey = typeof env.PUBLIC_ALGOLIA_API_KEY_CLIENT === "string" ? env.PUBLIC_ALGOLIA_API_KEY_CLIENT.trim() : "";
  return { appId, apiKey };
}

export async function fetchAndCacheWttjJobs(): Promise<WttjJob[]> {
  const cacheDir = path.join(careerOpsRoot(), "data", "cache");
  const cacheFile = path.join(cacheDir, "wttj-fr.json");

  try {
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        const raw = fs.readFileSync(cacheFile, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as WttjJob[];
        }
      }
    }
  } catch {
    /* fallback to fetch */
  }

  try {
    const envRes = await fetch("https://www.welcometothejungle.com/api/env", {
      headers: { "User-Agent": "career-ops/1.0" },
    });
    if (!envRes.ok) return [];
    const envText = await envRes.text();
    const { appId, apiKey } = parseEnvPayload(envText);
    const algoliaHost = `${appId}-dsn.algolia.net`;

    const queries = ["informatique", "support", "technicien", "developpeur", "reseau", "web"];
    const byUrl = new Map<string, WttjJob>();

    for (const query of queries) {
      const url = `https://${algoliaHost}/1/indexes/wttj_jobs_production_en/query`;
      const params = new URLSearchParams({
        query,
        hitsPerPage: "100",
        filters: "offices.country_code:FR",
        attributesToRetrieve: "name,slug,organization,offices,remote,published_at_timestamp",
      });

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-algolia-application-id": appId,
          "x-algolia-api-key": apiKey,
          referer: "https://www.welcometothejungle.com/",
          "content-type": "application/json",
        },
        body: JSON.stringify({ params: params.toString() }),
      });

      if (!res.ok) continue;
      const data = (await res.json()) as { hits?: Array<any> };
      if (!Array.isArray(data?.hits)) continue;

      for (const h of data.hits) {
        const title = (h.name || "").trim();
        const slug = (h.slug || "").trim();
        const orgSlug = (h.organization?.slug || "").trim();
        if (!title || !slug || !orgSlug) continue;

        const jobUrl = `https://www.welcometothejungle.com/en/companies/${orgSlug}/jobs/${slug}`;
        if (byUrl.has(jobUrl)) continue;

        const company = (h.organization?.name || "Welcome to the Jungle").trim();
        const office = Array.isArray(h.offices) && h.offices.length > 0 ? h.offices[0] : null;
        const parts: string[] = [];
        if (office?.city) parts.push(office.city.trim());
        if (office?.country) parts.push(office.country.trim());
        if (h.remote === "fulltime") parts.push("Télétravail");
        const location = parts.join(", ");

        const ts = h.published_at_timestamp;
        const postedAt = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString().slice(0, 10) : "";

        byUrl.set(jobUrl, { title, url: jobUrl, company, location, postedAt });
      }
    }

    const jobs = Array.from(byUrl.values());
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cacheFile, JSON.stringify(jobs, null, 2), "utf8");
    return jobs;
  } catch (err) {
    console.error("WTTJ fetch failed:", err);
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

export async function loadWttjDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheWttjJobs();
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    if (!matchesFilters(job.title, job.location, filters)) continue;

    offers.push({
      company: job.company,
      title: job.title,
      location: job.location,
      postedAt: job.postedAt || new Date().toISOString().slice(0, 10),
      ats: "portals",
      source: "wttj-fr",
      url: job.url,
      matchedKeyword: firstMatch(job.title, filters.positive),
      ...fitField(job.title, roleTargets),
    });
  }

  return offers;
}
