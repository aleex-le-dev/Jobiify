import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { titleFit } from "@/lib/title-fit.mjs";
import { acceptInZone, type Zone } from "./zone";
import { ANCHOR_CITIES, cacheKey, getEnvVar, readCache, searchKeywords, writeCache } from "./local-area";

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

export async function fetchAndCacheJoobleJobs(positive?: string[]): Promise<JoobleRawJob[]> {
  const apiKey = getEnvVar("JOOBLE_API_KEY");
  if (!apiKey) return [];

  const keywords = searchKeywords(positive, 8);
  const key = cacheKey("jooble", keywords);
  const cached = readCache<JoobleRawJob>(key, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    // Chaque mot-clé autour de chaque ville d'ancrage, rayon 40 km (valeur Jooble autorisée).
    const queries = keywords.flatMap((kw) => ANCHOR_CITIES.slice(0, 3).map((city) => ({ kw, loc: `${city}, France` })));
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
            radius: "40",
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
    if (jobs.length) writeCache(key, jobs);
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
  // 1. Le lieu fourni par Jooble prime dès qu'il est précis.
  const loc = (job.location || "").trim();
  if (loc && !/^(france|hauts[- ]de[- ]france|nord[- ]pas[- ]de[- ]calais|pas[- ]de[- ]calais|nord)$/i.test(loc.split(",")[0].trim())) {
    return loc;
  }
  // 2. Sinon, une commune nommée explicitement dans l'annonce (mot entier).
  const snippet = job.snippet || "";
  const m = snippet.match(/\b(Lillers|Béthune|Bethune|Bruay-la-Buissière|Auchel|Isbergues|Aire-sur-la-Lys|Lens|Liévin|Douvrin|Billy-Berclau|Noeux-les-Mines|Hazebrouck|Merville|Arras|Saint-Omer)\b/i);
  if (m) return m[1];
  // 3. Lieu vague : on le laisse vague, la zone de trajet l'écartera.
  return loc || "Pas-de-Calais";
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
  if (!zone && alwaysAllow.some((a) => a && matchesKeyword(fullLoc, a))) return true;

  if (zone) {
    // Zone de trajet active : elle seule décide (la liste "allow" ne peut plus la contourner).
    return acceptInZone({ ville: location, texte: title }, zone);
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
  const rawJobs = await fetchAndCacheJoobleJobs(filters?.positive);
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
