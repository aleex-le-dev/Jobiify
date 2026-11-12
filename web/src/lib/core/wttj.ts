import type { DiscoveredOffer, ExploreFilters } from "@/lib/explore";
import type { Zone } from "./zone";
import { cacheKey, readCache, searchKeywords, writeCache } from "./local-area";
import { fitField, matchedField, passesFilters } from "./offer-filter";
import type { SearchContext } from "./search-context";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

interface WttjJob {
  title: string;
  url: string;
  company: string;
  location: string;
  postedAt?: string;
  lat?: number;
  lon?: number;
  remote?: boolean;
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

/**
 * Welcome to the Jungle, interrogé avec les postes DU PROFIL (et non une liste
 * fixe de métiers) : chaque mot-clé est cherché en France, puis la zone de
 * trajet du profil trie les résultats grâce aux coordonnées de chaque bureau.
 */
export async function fetchAndCacheWttjJobs(ctx: SearchContext, positive?: string[]): Promise<WttjJob[]> {
  const keywords = searchKeywords(positive, 10);
  const key = cacheKey("wttj", keywords, ctx.key);
  const cached = readCache<WttjJob>(key, CACHE_TTL_MS);
  if (cached) return cached;

  try {
    const envRes = await fetch("https://www.welcometothejungle.com/api/env", {
      headers: { "User-Agent": "career-ops/1.0" },
    });
    if (!envRes.ok) return [];
    const { appId, apiKey } = parseEnvPayload(await envRes.text());
    const endpoint = `https://${appId}-dsn.algolia.net/1/indexes/wttj_jobs_production_en/query`;
    const byUrl = new Map<string, WttjJob>();

    const run = async (query: string, geo: boolean) => {
      const params = new URLSearchParams({
        query,
        hitsPerPage: "200",
        filters: "offices.country_code:FR",
        attributesToRetrieve: "name,slug,organization,offices,remote,published_at_timestamp",
        // Autour de la commune de départ quand c'est possible : les 200 résultats
        // sont alors ceux de la zone, pas les 200 premiers de toute la France.
        ...(geo ? { aroundLatLng: `${ctx.lat},${ctx.lon}`, aroundRadius: String(Math.round(ctx.radiusKm * 1000)) } : {}),
      });
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "x-algolia-application-id": appId,
          "x-algolia-api-key": apiKey,
          referer: "https://www.welcometothejungle.com/",
          "content-type": "application/json",
        },
        body: JSON.stringify({ params: params.toString() }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { hits?: Array<any> };
      if (!Array.isArray(data?.hits)) return false;

      for (const h of data.hits) {
        const title = (h.name || "").trim();
        const slug = (h.slug || "").trim();
        const orgSlug = (h.organization?.slug || "").trim();
        if (!title || !slug || !orgSlug) continue;

        const jobUrl = `https://www.welcometothejungle.com/fr/companies/${orgSlug}/jobs/${slug}`;
        if (byUrl.has(jobUrl)) continue;

        const office = Array.isArray(h.offices) && h.offices.length > 0 ? h.offices[0] : null;
        const parts: string[] = [];
        if (office?.city) parts.push(String(office.city).trim());
        if (h.remote === "fulltime") parts.push("100% Télétravail");
        else if (h.remote === "partial" || h.remote === "punctual") parts.push("Télétravail partiel");

        const ts = h.published_at_timestamp;
        const geoloc = office?._geoloc ?? h._geoloc;
        byUrl.set(jobUrl, {
          title,
          url: jobUrl,
          company: (h.organization?.name || "Welcome to the Jungle").trim(),
          location: parts.join(", "),
          postedAt: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : "",
          lat: typeof geoloc?.lat === "number" ? geoloc.lat : undefined,
          lon: typeof geoloc?.lng === "number" ? geoloc.lng : undefined,
          remote: h.remote === "fulltime",
        });
      }
      return true;
    };

    for (const query of keywords) {
      // Recherche locale d'abord ; si l'index refuse le filtre géographique, recherche nationale.
      if (!(await run(query, true))) await run(query, false);
    }

    const jobs = Array.from(byUrl.values());
    if (jobs.length) writeCache(key, jobs);
    return jobs;
  } catch (err) {
    console.error("WTTJ fetch failed:", err);
    return [];
  }
}

export async function loadWttjDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone: Zone | undefined,
  ctx: SearchContext,
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheWttjJobs(ctx, filters.positive);
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    if (!passesFilters({ title: job.title, location: job.location, lat: job.lat, lon: job.lon, remote: job.remote }, filters, zone)) continue;
    offers.push({
      company: job.company,
      title: job.title,
      location: job.location,
      postedAt: job.postedAt || "",
      ats: "portals",
      source: "wttj-fr",
      url: job.url,
      matchedKeyword: matchedField(job.title, filters),
      ...fitField(job.title, roleTargets),
    });
  }

  return offers;
}
