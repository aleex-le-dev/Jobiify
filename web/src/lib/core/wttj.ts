import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { titleFit } from "@/lib/title-fit.mjs";
import { inZone, type Zone } from "./zone";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

interface WttjJob {
  title: string;
  url: string;
  company: string;
  location: string;
  postedAt?: string;
  lat?: number;
  lon?: number;
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

    const queries = [
      "informatique",
      "support",
      "technicien",
      "developpeur",
      "reseau",
      "web",
      "helpdesk",
      "react",
      "php",
      "frontend",
      "fullstack",
    ];
    const byUrl = new Map<string, WttjJob>();

    for (const query of queries) {
      const url = `https://${algoliaHost}/1/indexes/wttj_jobs_production_en/query`;
      const params = new URLSearchParams({
        query,
        hitsPerPage: "200",
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
        if (h.remote === "fulltime") {
          parts.push("100% Télétravail");
        } else if (h.remote === "partial" || h.remote === "punctual") {
          parts.push("Télétravail partiel");
        }
        const location = parts.join(", ");

        const ts = h.published_at_timestamp;
        const postedAt = Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : "";
        const lat = typeof office?._geoloc?.lat === "number" ? office._geoloc.lat : typeof h._geoloc?.lat === "number" ? h._geoloc.lat : undefined;
        const lon = typeof office?._geoloc?.lng === "number" ? office._geoloc.lng : typeof h._geoloc?.lng === "number" ? h._geoloc.lng : undefined;

        byUrl.set(jobUrl, { title, url: jobUrl, company, location, postedAt, lat, lon });
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

function firstMatch(title: string, positives?: string[]): string | undefined {
  if (!positives || !Array.isArray(positives)) return undefined;
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
  filters?: ExploreFilters,
  job?: WttjJob,
  zone?: Zone,
): boolean {
  const negative = filters?.negative || [];
  if (negative.some((n) => n && matchesKeyword(title, n))) return false;
  const positive = filters?.positive || [];
  if (positive.length > 0 && !positive.some((p) => p && matchesKeyword(title, p))) return false;

  const fullLoc = location.toLowerCase();
  const blockHard = filters?.blockHard || [];
  if (isBlockedLocation(fullLoc, blockHard)) return false;
  const block = filters?.block || [];
  if (isBlockedLocation(fullLoc, block)) return false;

  const is100Remote = fullLoc.includes("100% télétravail") || fullLoc.includes("full remote");
  if (filters?.remoteOnly) {
    return is100Remote;
  }
  const userWantsRemote = (filters?.allow || []).some((a) => /remote|t[eé]l[eé]travail/i.test(a));
  if (is100Remote && userWantsRemote) return true;

  const alwaysAllow = filters?.alwaysAllow || [];
  if (alwaysAllow.some((a) => a && matchesKeyword(fullLoc, a))) return true;

  if (zone) {
    const verdict = inZone({ ville: location, lat: job?.lat, lon: job?.lon }, zone);
    if (verdict === "oui") return true;
    if (verdict === "non") {
      const allow = filters?.allow || [];
      if (allow.some((a) => a && matchesKeyword(fullLoc, a))) return true;
      return false;
    }
    if (filters?.allow && filters.allow.length > 0) {
      return filters.allow.some((a) => a && matchesKeyword(fullLoc, a));
    }
    return true;
  }

  const allow = filters?.allow || [];
  if (allow.length > 0 && !allow.some((a) => a && matchesKeyword(fullLoc, a))) return false;

  return true;
}

export async function loadWttjDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone?: Zone,
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheWttjJobs();
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    if (!matchesFilters(job.title, job.location, filters, job, zone)) continue;

    offers.push({
      company: job.company,
      title: job.title,
      location: job.location,
      postedAt: job.postedAt || "",
      ats: "portals",
      source: "wttj-fr",
      url: job.url,
      matchedKeyword: firstMatch(job.title, filters?.positive),
      ...fitField(job.title, roleTargets),
    });
  }

  return offers;
}
