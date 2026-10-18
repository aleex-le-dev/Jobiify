import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { titleFit } from "@/lib/title-fit.mjs";
import { inZone, type Zone } from "./zone";

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

function getEnvVar(key: string): string | undefined {
  if (process.env[key]?.trim()) return process.env[key]?.trim();
  try {
    const envPaths = [
      path.join(careerOpsRoot(), "web", ".env.local"),
      path.join(careerOpsRoot(), ".env"),
      path.join(process.cwd(), ".env.local"),
      path.join(process.cwd(), ".env"),
    ];
    for (const p of envPaths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, "utf8");
        const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
        if (match && match[1]?.trim()) {
          return match[1].trim().replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export async function fetchAndCacheJoobleJobs(): Promise<JoobleRawJob[]> {
  const apiKey = getEnvVar("JOOBLE_API_KEY");
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
    const queries = [
      { kw: "technicien informatique", loc: "Pas-de-Calais, France" },
      { kw: "support informatique", loc: "Pas-de-Calais, France" },
      { kw: "developpeur web", loc: "Pas-de-Calais, France" },
      { kw: "informatique", loc: "Béthune, France" },
      { kw: "informatique", loc: "Lens, France" },
      { kw: "informatique", loc: "Arras, France" },
      { kw: "technicien helpdesk", loc: "Pas-de-Calais, France" },
      { kw: "administrateur systeme", loc: "Pas-de-Calais, France" },
      { kw: "technicien reseau", loc: "Pas-de-Calais, France" },
      { kw: "integrateur web", loc: "Pas-de-Calais, France" },
      { kw: "support applicatif", loc: "Pas-de-Calais, France" },
      { kw: "informatique", loc: "Pas-de-Calais, France" },
    ];
    const allJobs = new Map<string, JoobleRawJob>();

    for (const q of queries) {
      for (let page = 1; page <= 2; page++) {
        const url = `https://jooble.org/api/${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            keywords: q.kw,
            location: q.loc,
            page,
          }),
        });

        if (!res.ok) break;

        const data = (await res.json()) as { jobs?: JoobleRawJob[] };
        const fetched = data.jobs || [];
        for (const item of fetched) {
          if (item.link && !allJobs.has(item.link)) {
            allJobs.set(item.link, item);
          }
        }
        if (fetched.length < 20) break; // Dernière page
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

const NON_IT_TITLE_REGEX =
  /\b(production\s+automobile|chimie|chemical|fluvial|m[ée]canique|usinage|qualit[ée]\s+uap|approvisionnement\s+mati[èe]re|technical cleanliness)\b/i;

function resolveJoobleLocation(job: JoobleRawJob): string {
  const snippet = (job.snippet || "").toLowerCase();
  const company = (job.company || "").toLowerCase();
  if (company.includes("automotive cells company") || company.includes("acc")) {
    return "Billy-Berclau / Douvrin (62)";
  }
  if (snippet.includes("lens")) return "Lens (62)";
  if (snippet.includes("arras")) return "Arras (62)";
  if (snippet.includes("béthune") || snippet.includes("bethune")) return "Béthune (62)";
  if (snippet.includes("calais")) return "Calais (62)";
  if (snippet.includes("douvrin")) return "Douvrin (62)";
  if (snippet.includes("saint-omer")) return "Saint-Omer (62)";
  if (job.location && job.location.toLowerCase() !== "france") {
    return job.location;
  }
  return "Pas-de-Calais (62)";
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
  zone?: Zone,
): boolean {
  if (NON_IT_TITLE_REGEX.test(title)) return false;
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
    const verdict = inZone({ ville: location }, zone);
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

export async function loadJoobleDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone?: Zone,
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheJoobleJobs();
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    const loc = resolveJoobleLocation(job);
    if (!matchesFilters(job.title, loc, filters, zone)) continue;

    offers.push({
      company: job.company || "Entreprise / PME (via Jooble)",
      title: job.title.replace(/<[^>]*>?/gm, ""), // Retirer d'éventuelles balises
      location: loc,
      postedAt: job.updated || "",
      ats: "portals",
      source: "jooble-pme",
      url: job.link,
      matchedKeyword: firstMatch(job.title, filters?.positive),
      ...fitField(job.title, roleTargets),
    });
  }

  return offers;
}
