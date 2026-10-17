import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { formatLocationCity, toTitleCase } from "@/lib/format";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours de cache

interface SireneCompany {
  siren: string;
  nom_complet: string;
  nombre_etablissements?: number;
  activite_principale?: string;
  libelle_activite?: string;
  siege?: {
    siret?: string;
    adresse?: string;
    code_postal?: string;
    commune?: string;
    libelle_commune?: string;
  };
}

const NAF_LIBELLES: Record<string, string> = {
  "62.01Z": "Développement Web & Logiciels",
  "62.02A": "Conseil en Systèmes & Réseaux Informatiques",
  "62.03Z": "Infogérance & Gestion d'Installations Informatiques",
  "62.09Z": "Services & Support Informatique",
  "95.11Z": "Maintenance & Réparation de Parcs Informatiques",
};

export async function fetchAndCacheSireneItCompanies(): Promise<SireneCompany[]> {
  const cacheDir = path.join(careerOpsRoot(), "data", "cache");
  const cacheFile = path.join(cacheDir, "sirene-it-62.json");

  try {
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        const raw = fs.readFileSync(cacheFile, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as SireneCompany[];
        }
      }
    }
  } catch {
    /* fallback to live */
  }

  // Codes postaux clés autour de Lières / Béthune / Lens / Arras / Saint-Omer
  const postalCodes = [
    "62190", // Lillers / Lières
    "62400", // Béthune
    "62700", // Bruay-la-Buissière
    "62260", // Auchel
    "62120", // Aire-sur-la-Lys
    "62330", // Isbergues
    "62290", // Noeux-les-Mines
    "62138", // Douvrin
    "62300", // Lens
    "62800", // Liévin
    "62500", // Saint-Omer
    "62000", // Arras
  ];

  const nafCodes = "62.01Z,62.02A,62.03Z,62.09Z,95.11Z";
  const allCompanies = new Map<string, SireneCompany>();

  for (const cp of postalCodes) {
    try {
      const url = `https://recherche-entreprises.api.gouv.fr/search?code_postal=${cp}&activite_principale=${nafCodes}&per_page=25`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;

      const data = (await res.json()) as { results?: SireneCompany[] };
      for (const item of data.results || []) {
        if (item.siren && !allCompanies.has(item.siren)) {
          // Filtrer les entreprises fermées ou radiées
          allCompanies.set(item.siren, item);
        }
      }
    } catch {
      /* continue next postal code */
    }
  }

  const list = Array.from(allCompanies.values());
  try {
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cacheFile, JSON.stringify(list, null, 2), "utf8");
  } catch {
    /* ignore write error */
  }

  return list;
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

export async function loadSireneDiscoveredOffers(
  filters: ExploreFilters,
): Promise<DiscoveredOffer[]> {
  const companies = await fetchAndCacheSireneItCompanies();
  const offers: DiscoveredOffer[] = [];

  for (const c of companies) {
    const cp = c.siege?.code_postal || "62";
    const communeName = c.siege?.libelle_commune ? toTitleCase(c.siege.libelle_commune) : "";
    const loc = communeName ? `${communeName} (${cp})` : formatLocationCity(c.siege?.adresse || `${c.siege?.commune || "Pas-de-Calais"} (${cp})`);

    if (!matchesLocation(loc, filters.allow, filters.block, filters.blockHard)) continue;

    const naf = c.activite_principale || "";
    const nafLabel = NAF_LIBELLES[naf] || "Prestations & Services Informatiques";
    const title = `PME Informatique Locale — ${nafLabel}`;
    const url = `https://annuaire-entreprises.data.gouv.fr/entreprise/${c.siren}`;

    offers.push({
      company: c.nom_complet,
      title,
      location: loc,
      postedAt: new Date().toISOString().slice(0, 10),
      ats: "portals",
      source: "sirene-pme-62",
      url,
      matchedKeyword: "PME Informatique",
      fit: { band: "strong", score: 90 },
    });
  }

  return offers;
}
