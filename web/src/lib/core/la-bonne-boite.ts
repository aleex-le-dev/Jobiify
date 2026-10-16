import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { titleFit } from "@/lib/title-fit.mjs";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

interface LbbCompany {
  name: string;
  siret: string;
  address?: string;
  city?: string;
  postcode?: string;
  stars?: number;
  headcount_text?: string;
  naf_text?: string;
  url?: string;
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
      scope: "api_labonneboitev1 o2dsoffre",
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    cachedToken = {
      access_token: data.access_token,
      expires_at: Date.now() + (data.expires_in || 1499) * 1000,
    };
    return cachedToken.access_token;
  } catch {
    return null;
  }
}

export async function fetchAndCacheLaBonneBoiteCompanies(): Promise<LbbCompany[]> {
  const clientId = process.env.FRANCETRAVAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.FRANCETRAVAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return [];
  }

  const cacheDir = path.join(careerOpsRoot(), "data", "cache");
  const cacheFile = path.join(cacheDir, "la-bonne-boite-62.json");

  try {
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        const raw = fs.readFileSync(cacheFile, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as LbbCompany[];
        }
      }
    }
  } catch {
    /* fallback to live */
  }

  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return [];

  try {
    // Codes ROME :
    // M1801 : Administration de systèmes d'information
    // M1802 : Conseil et maîtrise d'ouvrage en systèmes d'information
    // M1803 : Direction des systèmes d'information
    // M1805 : Études et développement informatique
    // M1806 : Conseil et assistance technique en informatique (Helpdesk/Support)
    // I1401 : Maintenance informatique et bureautique
    const romeCodes = "M1801,M1805,M1806,I1401";
    const url = `https://api.francetravail.io/partenaire/labonneboite/v1/company/?rome_codes=${romeCodes}&departement=62`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as { companies?: LbbCompany[] };
    const companies = data.companies || [];

    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cacheFile, JSON.stringify(companies, null, 2), "utf8");
    return companies;
  } catch (err) {
    console.error("La Bonne Boîte fetch failed:", err);
    return [];
  }
}

function matchesKeyword(text: string, kw: string): boolean {
  return text.toLowerCase().includes(kw.toLowerCase().trim());
}

function matchesLocation(location: string, allow: string[], block: string[], blockHard: string[]): boolean {
  if (blockHard.some((b) => b && matchesKeyword(location, b))) return false;
  if (block.some((b) => b && matchesKeyword(location, b))) return false;
  if (allow.length === 0) return true;
  return allow.some((a) => a && matchesKeyword(location, a));
}

export async function loadLaBonneBoiteDiscoveredOffers(
  filters: ExploreFilters,
  roleTargets: string[],
): Promise<DiscoveredOffer[]> {
  const companies = await fetchAndCacheLaBonneBoiteCompanies();
  const offers: DiscoveredOffer[] = [];

  for (const c of companies) {
    const loc = `${c.city || ""} (${c.postcode || "62"})`.trim();
    if (!matchesLocation(loc, filters.allow, filters.block, filters.blockHard)) continue;

    const url = c.url || `https://labonneboite.francetravail.fr/entreprise/${c.siret}`;
    const title = `PME avec fort potentiel d'embauche IT (${c.naf_text || "Services Numériques & Informatique"})`;

    offers.push({
      company: c.name,
      title,
      location: loc,
      postedAt: new Date().toISOString().slice(0, 10),
      ats: "portals",
      source: "la-bonne-boite-pme",
      url,
      matchedKeyword: "PME Informatique",
      fit: { band: "strong", score: 85 },
    });
  }

  return offers;
}
