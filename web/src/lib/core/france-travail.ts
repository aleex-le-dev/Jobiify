import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { formatLocationCity, normalizeDateToIso } from "@/lib/format";
import { titleFit } from "@/lib/title-fit.mjs";
import { inZone, type Zone } from "./zone";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 heures

interface FtRawJob {
  id: string;
  intitule: string;
  description?: string;
  dateCreation?: string;
  dateActualisation?: string;
  lieuTravail?: {
    libelle?: string;
    codePostal?: string;
    commune?: string;
    latitude?: number;
    longitude?: number;
  };
  entreprise?: {
    nom?: string;
  };
  origineOffre?: {
    urlOrigine?: string;
    partenaires?: Array<{ nom?: string; url?: string }>;
  };
}

let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (cachedToken && cachedToken.expires_at > Date.now() + 60_000) {
    return cachedToken.access_token;
  }

  try {
    const tokenUrl = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "api_offresdemploiv2 o2dsoffre",
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      console.warn("France Travail OAuth2 failed with status", res.status);
      return null;
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in || 1499) * 1000,
    };
    return cachedToken.access_token;
  } catch (err) {
    console.error("France Travail OAuth error:", err);
    return null;
  }
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

export async function fetchAndCacheFranceTravailJobs(): Promise<FtRawJob[]> {
  const clientId = getEnvVar("FRANCETRAVAIL_CLIENT_ID");
  const clientSecret = getEnvVar("FRANCETRAVAIL_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return [];
  }

  const cacheDir = path.join(careerOpsRoot(), "data", "cache");
  const cacheFile = path.join(cacheDir, "france-travail-62.json");

  try {
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        const raw = fs.readFileSync(cacheFile, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as FtRawJob[];
        }
      }
    }
  } catch {
    /* fallback to live fetch */
  }

  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return [];

  try {
    const keywords = ["informatique", "technicien", "support", "developpeur", "reseau"];
    const allJobs = new Map<string, FtRawJob>();

    for (const kw of keywords) {
      const url = `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?departement=62&motsCles=${encodeURIComponent(kw)}&range=0-149`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        // Status 206 (Partial Content) ou 200 sont valides, 204 = no content
        if (res.status === 204) continue;
        continue;
      }

      const data = (await res.json()) as { resultats?: FtRawJob[] };
      for (const item of data.resultats || []) {
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
    console.error("France Travail search failed:", err);
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
  filters: ExploreFilters,
  job?: FtRawJob,
  zone?: Zone,
): boolean {
  if (filters.negative.some((n) => n && matchesKeyword(title, n))) return false;
  if (filters.positive.length > 0 && !filters.positive.some((p) => p && matchesKeyword(title, p))) return false;

  const fullLoc = location.toLowerCase();
  if (isBlockedLocation(fullLoc, filters.blockHard)) return false;
  if (isBlockedLocation(fullLoc, filters.block)) return false;

  if (filters.remoteOnly) {
    const isRemote = fullLoc.includes("100% télétravail") || fullLoc.includes("remote");
    if (!isRemote) return false;
    return true;
  }

  if (zone) {
    const verdict = inZone(
      {
        lat: job?.lieuTravail?.latitude,
        lon: job?.lieuTravail?.longitude,
        codeInsee: job?.lieuTravail?.commune,
        ville: job?.lieuTravail?.libelle || location,
      },
      zone,
    );
    if (verdict === "oui") return true;
    if (verdict === "non") {
      const allow = filters.allow || [];
      if (allow.some((a) => a && matchesKeyword(fullLoc, a))) return true;
      return false;
    }
    if (filters.allow && filters.allow.length > 0) {
      return filters.allow.some((a) => a && matchesKeyword(fullLoc, a));
    }
    return true;
  }

  if (filters.allow.length > 0 && !filters.allow.some((a) => a && matchesKeyword(fullLoc, a))) return false;

  return true;
}

export async function loadFranceTravailDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone?: Zone,
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheFranceTravailJobs();
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    const loc = job.lieuTravail?.libelle || job.lieuTravail?.commune || "Pas-de-Calais (62)";
    if (!matchesFilters(job.intitule, loc, filters, job, zone)) continue;

    const partnerUrl = job.origineOffre?.partenaires?.[0]?.url;
    const originUrl = job.origineOffre?.urlOrigine;
    const directUrl = `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(job.id)}`;
    const finalUrl = partnerUrl || originUrl || directUrl;

    const cleanCity = formatLocationCity(loc) || loc;
    const rawDate = job.dateActualisation || job.dateCreation || "";
    const postedAt = rawDate || "";

    offers.push({
      company: job.entreprise?.nom || "France Travail (Employeur confidentiel)",
      title: job.intitule,
      location: cleanCity,
      postedAt,
      ats: "portals",
      source: "france-travail",
      url: finalUrl,
      matchedKeyword: firstMatch(job.intitule, filters.positive),
      ...fitField(job.intitule, roleTargets),
    });
  }

  return offers;
}
