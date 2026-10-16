import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { titleFit } from "@/lib/title-fit.mjs";

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

export async function fetchAndCacheFranceTravailJobs(): Promise<FtRawJob[]> {
  const clientId = process.env.FRANCETRAVAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.FRANCETRAVAIL_CLIENT_SECRET?.trim();
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

export async function loadFranceTravailDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
): Promise<DiscoveredOffer[]> {
  const rawJobs = await fetchAndCacheFranceTravailJobs();
  const offers: DiscoveredOffer[] = [];

  for (const job of rawJobs) {
    const loc = job.lieuTravail?.libelle || job.lieuTravail?.commune || "Pas-de-Calais (62)";
    if (!matchesFilters(job.intitule, loc, filters)) continue;

    const partnerUrl = job.origineOffre?.partenaires?.[0]?.url;
    const originUrl = job.origineOffre?.urlOrigine;
    const directUrl = `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(job.id)}`;
    const finalUrl = partnerUrl || originUrl || directUrl;

    offers.push({
      company: job.entreprise?.nom || "France Travail (Employeur confidentiel)",
      title: job.intitule,
      location: loc,
      postedAt: (job.dateActualisation || job.dateCreation || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      ats: "portals",
      source: "france-travail",
      url: finalUrl,
      matchedKeyword: firstMatch(job.intitule, filters.positive),
      ...fitField(job.intitule, roleTargets),
    });
  }

  return offers;
}
