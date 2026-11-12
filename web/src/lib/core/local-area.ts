import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { genderVariants } from "@/lib/job-synonyms.mjs";

/**
 * Secteur géographique de recherche, partagé par toutes les sources régionales
 * (France Travail, Jooble, Adzuna, La Bonne Boîte). Centré sur Lières (62190).
 * Le rayon se règle avec RECHERCHE_RAYON_KM dans .env (défaut 35 km ≈ 30 min de trajet : couvre
 * Béthune, Bruay, Liévin, Hazebrouck, Saint-Omer, Aire-sur-la-Lys).
 * Le filtre de temps de trajet de l'Explorer affine ensuite ce résultat large.
 */
export const ORIGIN = {
  nom: "Lières",
  codePostal: "62190",
  insee: "62508",
  lat: 50.5489,
  lon: 2.412,
};

/** Villes d'ancrage pour les API qui cherchent par nom de lieu (Jooble, Adzuna). */
export const ANCHOR_CITIES = ["Lillers", "Béthune", "Bruay-la-Buissière", "Hazebrouck", "Saint-Omer", "Liévin"];

/** Mots-clés par défaut quand l'utilisateur n'a pas de filtre de titre. */
export const DEFAULT_KEYWORDS = [
  "informatique",
  "technicien informatique",
  "support informatique",
  "helpdesk",
  "developpeur",
  "developpeur web",
  "administrateur systeme",
  "reseau",
];

export function getEnvVar(key: string): string | undefined {
  if (process.env[key]?.trim()) return process.env[key]?.trim();
  try {
    const envPaths = [
      path.join(careerOpsRoot(), ".env"),
      path.join(careerOpsRoot(), "web", ".env.local"),
      path.join(process.cwd(), ".env.local"),
      path.join(process.cwd(), ".env"),
    ];
    for (const p of envPaths) {
      if (!fs.existsSync(p)) continue;
      const match = fs.readFileSync(p, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
      if (match && match[1]?.trim()) return match[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function radiusKm(): number {
  const n = Number(getEnvVar("RECHERCHE_RAYON_KM"));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100) : 35;
}

/**
 * Mots-clés de recherche dérivés des filtres positifs : normalisés, dédoublonnés,
 * plafonnés pour rester dans les quotas des API gratuites.
 * Les variantes de genre d'un mot-clé déjà retenu (« technicienne support ») sont
 * sautées : les moteurs d'offres les traitent comme la même requête, et chaque
 * place libérée sert à un vrai synonyme métier.
 */
export function searchKeywords(positive: string[] | undefined, max = 10): string[] {
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      // « (h/f) », « n1/n2 » : du bruit pour un moteur de recherche d'offres.
      .replace(/\(?\b[hfm]\s*\/\s*[hfmx]\b\)?/g, " ")
      .replace(/\bn\d(\s*\/\s*n?\d)*\b/g, " ")
      .replace(/[^a-z0-9+#' -]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const out: string[] = [];
  const skip = new Set<string>();
  // Les mots-clés par défaut (informatique) ne servent que si le profil n'a aucun poste :
  // un profil « cariste » ne doit pas se retrouver avec des requêtes « helpdesk ».
  const source = positive && positive.length > 0 ? positive : DEFAULT_KEYWORDS;
  for (const k of source) {
    const f = fold(k);
    if (f.length < 3 || out.includes(f) || skip.has(f)) continue;
    out.push(f);
    for (const v of genderVariants(f) as string[]) skip.add(fold(v));
    if (out.length >= max) break;
  }
  return out;
}

/** Cache JSON disque partagé (data/cache/{name}.json) avec TTL. */
export function readCache<T>(name: string, ttlMs: number): T[] | null {
  try {
    const file = path.join(careerOpsRoot(), "data", "cache", `${name}.json`);
    if (!fs.existsSync(file)) return null;
    if (Date.now() - fs.statSync(file).mtimeMs >= ttlMs) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export function writeCache(name: string, data: unknown[]): void {
  try {
    const dir = path.join(careerOpsRoot(), "data", "cache");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(data), "utf8");
  } catch {
    /* le cache est une optimisation */
  }
}

/** Clé de cache stable pour un jeu de mots-clés + une zone (ville de départ et rayon). */
export function cacheKey(prefix: string, keywords: string[], scope = ""): string {
  const raw = `${scope || radiusKm()}|${keywords.join(",")}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) | 0;
  return `${prefix}-${(h >>> 0).toString(36)}`;
}
