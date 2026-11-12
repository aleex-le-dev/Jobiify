import type { ExploreFilters } from "@/lib/explore";
import { ANCHOR_CITIES, ORIGIN, radiusKm, readCache, writeCache } from "./local-area";
import { norm, rayonMaxKm, type Zone } from "./zone";

/**
 * Où chercher, pour un profil donné. Toutes les sources d'offres reçoivent ce
 * contexte au lieu d'un point fixe : un profil qui part d'Arras ou de Lille
 * interroge les API autour de SA commune, avec SON rayon.
 */
export interface SearchContext {
  /** Nom de la commune de départ (ex. « Lières »). */
  nom: string;
  /** Code INSEE de la commune de départ, "" si inconnu. */
  insee: string;
  codePostal: string;
  lat: number;
  lon: number;
  /** Rayon couvrant toute la zone de trajet, en km (plafonné à 100). */
  radiusKm: number;
  /** Communes les plus peuplées de la zone, pour les API qui cherchent par nom de ville. */
  anchors: string[];
  /** Départements touchés par la zone (ex. ["62", "59"]). */
  departements: string[];
  /** Identifiant stable de la zone, pour les clés de cache. */
  key: string;
}

const DEFAULT_CONTEXT = (): SearchContext => ({
  nom: ORIGIN.nom,
  insee: ORIGIN.insee,
  codePostal: ORIGIN.codePostal,
  lat: ORIGIN.lat,
  lon: ORIGIN.lon,
  radiusKm: radiusKm(),
  anchors: [...ANCHOR_CITIES],
  departements: ["62", "59"],
  key: `default-${radiusKm()}`,
});

const depOf = (code: string) => (code.startsWith("97") ? code.slice(0, 3) : code.slice(0, 2));

/** Communes les plus peuplées de la zone (ville de départ en tête). Cache disque 30 jours. */
async function anchorCities(zone: Zone, origin: string, departements: string[], key: string): Promise<string[]> {
  const cacheName = `anchors-${key}`;
  const cached = readCache<string>(cacheName, 30 * 24 * 60 * 60 * 1000);
  if (cached) return cached;
  // Zone très étendue (départ hors région chargé sur toute la France) : la ville de départ suffit.
  if (departements.length > 6) return [origin];
  const ranked: Array<{ nom: string; population: number }> = [];
  await Promise.all(
    departements.map(async (d) => {
      try {
        const res = await fetch(`https://geo.api.gouv.fr/departements/${d}/communes?fields=nom,code,population`);
        if (!res.ok) return;
        const list = (await res.json()) as Array<{ nom: string; code: string; population?: number }>;
        for (const c of list) if (zone.codes.has(c.code)) ranked.push({ nom: c.nom, population: c.population || 0 });
      } catch {
        /* une liste de villes d'ancrage incomplète reste utilisable */
      }
    }),
  );
  ranked.sort((a, b) => b.population - a.population);
  const out = [origin, ...ranked.map((c) => c.nom).filter((n) => norm(n) !== norm(origin))].slice(0, 6);
  if (ranked.length) writeCache(cacheName, out);
  return out;
}

export async function buildSearchContext(
  filters: Pick<ExploreFilters, "originCity" | "originInsee">,
  zone?: Zone,
): Promise<SearchContext> {
  if (!zone) return DEFAULT_CONTEXT();
  const nom = (zone.villeDepart || filters.originCity || ORIGIN.nom).replace(/\s*\(.*?\)\s*/g, "").trim() || ORIGIN.nom;
  const commune =
    zone.communes.find((c) => filters.originInsee && c.code === filters.originInsee) ||
    zone.communes.find((c) => norm(c.nom) === norm(nom));
  const insee = commune?.code || filters.originInsee || "";
  const [lon, lat] = zone.origin;
  const radius = Math.min(100, Math.max(5, Math.ceil(rayonMaxKm(zone))));
  const departements = Array.from(new Set(zone.communes.map((c) => depOf(c.code)))).sort();
  const key = `${insee || norm(nom).replace(/\s+/g, "-")}-${radius}`;
  return {
    nom,
    insee,
    codePostal: commune?.codesPostaux[0] || "",
    lat,
    lon,
    radiusKm: radius,
    anchors: await anchorCities(zone, nom, departements, key),
    departements: departements.length ? departements : ["62", "59"],
    key,
  };
}
