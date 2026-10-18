import { point } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";

const DEPARTEMENTS = ["62", "59", "80"];
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours (les communes ne changent pas)

export interface ZoneCommune {
  nom: string;
  code: string; // Code INSEE (ex: 62508)
  codesPostaux: string[];
}

export interface ZoneData {
  origin: [number, number]; // [lon, lat]
  polygon: any; // GeoJSON Feature
  communes: ZoneCommune[];
  minutes: number;
  villeDepart: string;
  generatedAt: string;
  method: "openrouteservice" | "haversine-fallback";
}

export interface Zone extends ZoneData {
  codes: Set<string>;
  noms: Set<string>;
  cps: Set<string>;
}

export interface OffreLocation {
  lat?: number | null;
  lon?: number | null;
  codeInsee?: string | null;
  ville?: string | null;
  teletravail?: boolean | null;
}

export type ZoneVerdict = "oui" | "non" | "inconnu";

export const norm = (s: string): string =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const rad = (d: number): number => (d * Math.PI) / 180;

export function haversineKm([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Génère un polygone circulaire régulier au format GeoJSON Feature */
export function makeCirclePolygon([lon0, lat0]: [number, number], radiusKm: number, steps = 64): any {
  const coords: [number, number][] = [];
  const dByR = radiusKm / 6371;
  const radLat0 = rad(lat0);
  const radLon0 = rad(lon0);

  for (let i = 0; i <= steps; i++) {
    const angle = (i * 2 * Math.PI) / steps;
    const lat = Math.asin(
      Math.sin(radLat0) * Math.cos(dByR) +
      Math.cos(radLat0) * Math.sin(dByR) * Math.cos(angle)
    );
    const lon =
      radLon0 +
      Math.atan2(
        Math.sin(angle) * Math.sin(dByR) * Math.cos(radLat0),
        Math.cos(dByR) - Math.sin(radLat0) * Math.sin(lat)
      );
    coords.push([(lon * 180) / Math.PI, (lat * 180) / Math.PI]);
  }

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
    properties: { radiusKm },
  };
}

/** Récupère les coordonnées du centre d'une commune via geo.api.gouv.fr */
export async function centreCommune(nom: string, dep = "62"): Promise<[number, number]> {
  try {
    const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(nom)}&codeDepartement=${dep}&fields=centre&limit=1`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as Array<{ centre?: { coordinates: [number, number] } }>;
      if (data[0]?.centre?.coordinates) {
        return data[0].centre.coordinates; // [lon, lat]
      }
    }

    // Essayer sans restriction de département si introuvable dans le 62
    const urlAny = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(nom)}&fields=centre&limit=1`;
    const resAny = await fetch(urlAny);
    if (resAny.ok) {
      const dataAny = (await resAny.json()) as Array<{ centre?: { coordinates: [number, number] } }>;
      if (dataAny[0]?.centre?.coordinates) {
        return dataAny[0].centre.coordinates;
      }
    }
  } catch (err) {
    console.warn(`[zone] Impossible de géolocaliser ${nom}, repli sur Lières:`, err);
  }

  // Coordonnées par défaut : Lières (62190)
  return [2.4178, 50.5539];
}

/** Calcule ou charge depuis le cache la zone isochrone (OpenRouteService ou rayon Haversine) */
export async function loadZone(minutes = 30, villeDepart = "Lières"): Promise<Zone> {
  const normVille = norm(villeDepart) || "lieres";
  const cacheDir = path.join(careerOpsRoot(), "data", "cache", "zones");
  const cacheFile = path.join(cacheDir, `zone-${normVille}-${minutes}min.json`);

  let data: ZoneData | undefined;

  // 1. Tenter de lire le cache JSON local
  try {
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
        data = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as ZoneData;
      }
    }
  } catch (err) {
    console.warn(`[zone] Erreur lecture cache ${cacheFile}:`, err);
  }

  // 2. Si pas en cache, calcul complet
  if (!data || !Array.isArray(data.communes) || data.communes.length === 0) {
    const origin = await centreCommune(villeDepart);
    let polygon: any = null;
    let method: "openrouteservice" | "haversine-fallback" = "haversine-fallback";

    const orsKey = process.env.ORS_KEY;
    if (orsKey) {
      try {
        const res = await fetch("https://api.openrouteservice.org/v2/isochrones/driving-car", {
          method: "POST",
          headers: {
            Authorization: orsKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            locations: [origin],
            range: [minutes * 60],
          }),
        });
        if (res.ok) {
          const orsJson = (await res.json()) as { features?: any[] };
          if (orsJson.features && orsJson.features.length > 0) {
            polygon = orsJson.features[0];
            method = "openrouteservice";
          }
        } else {
          console.warn(`[zone] ORS a répondu ${res.status}, utilisation du secours Haversine.`);
        }
      } catch (err) {
        console.warn("[zone] Erreur lors de l'appel OpenRouteService:", err);
      }
    }

    // Solution de secours : centre + rayon Haversine (1 min ≈ 1 km en moyenne dans le secteur)
    if (!polygon) {
      const radiusKm = minutes;
      polygon = makeCirclePolygon(origin, radiusKm);
      method = "haversine-fallback";
    }

    // Récupération des communes des départements 62, 59, 80
    const rawCommunes = (
      await Promise.all(
        DEPARTEMENTS.map(async (d) => {
          try {
            const res = await fetch(
              `https://geo.api.gouv.fr/departements/${d}/communes?fields=nom,code,centre,codesPostaux`,
            );
            if (!res.ok) return [];
            return (await res.json()) as Array<{
              nom: string;
              code: string;
              centre?: { coordinates: [number, number] };
              codesPostaux?: string[];
            }>;
          } catch {
            return [];
          }
        }),
      )
    ).flat();

    // Intersection des communes avec le polygone (Turf)
    const polyCheck = booleanPointInPolygon as any;
    const communes: ZoneCommune[] = rawCommunes
      .filter((c) => {
        if (!c.centre?.coordinates) return false;
        try {
          const pt = point(c.centre.coordinates);
          return (polyCheck.default || polyCheck)(pt, polygon);
        } catch {
          return false;
        }
      })
      .map(({ nom, code, codesPostaux }) => ({
        nom,
        code,
        codesPostaux: Array.isArray(codesPostaux) ? codesPostaux : [],
      }));

    data = {
      origin,
      polygon,
      communes,
      minutes,
      villeDepart,
      generatedAt: new Date().toISOString(),
      method,
    };

    // Écriture du cache
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), "utf8");
    } catch (err) {
      console.warn(`[zone] Erreur écriture cache ${cacheFile}:`, err);
    }
  }

  return {
    ...data,
    codes: new Set(data.communes.map((c) => c.code)),
    noms: new Set(data.communes.map((c) => norm(c.nom))),
    cps: new Set(data.communes.flatMap((c) => c.codesPostaux)),
  };
}

/** Calcule le rayon maximal en km depuis le point d'origine jusqu'au bord du polygone */
export function rayonMaxKm(zone: { origin: [number, number]; polygon: any }): number {
  const [lon0, lat0] = zone.origin;
  const geom = zone.polygon?.geometry;
  if (!geom) return 30;

  let coords: [number, number][] = [];
  if (geom.type === "Polygon") {
    coords = geom.coordinates?.[0] || [];
  } else if (geom.type === "MultiPolygon") {
    coords = (geom.coordinates || []).flat(2);
  }

  if (coords.length === 0) return 30;

  return Math.max(
    ...coords.map(([lon, lat]) => haversineKm([lon0, lat0], [lon, lat])),
  );
}

const REGIONS_GENERIQUES = new Set([
  "pas de calais",
  "nord",
  "somme",
  "hauts de france",
  "france",
  "region",
]);

/**
 * Détermine si une offre est située dans la zone de trajet.
 * Logique en cascade du plus précis au moins précis :
 * 1. Coordonnées GPS (lat/lon) via polygone Turf
 * 2. Code INSEE via zone.codes
 * 3. Code postal (ex: 62400) via zone.cps
 * 4. Nom de commune via zone.noms
 */
export function inZone(offre: OffreLocation, zone: Zone): ZoneVerdict {
  // 1. Test GPS précis par polygone
  if (offre.lat != null && offre.lon != null) {
    try {
      const pt = point([offre.lon, offre.lat]);
      const polyCheck = booleanPointInPolygon as any;
      const isInside = (polyCheck.default || polyCheck)(pt, zone.polygon);
      return isInside ? "oui" : "non";
    } catch {
      // repli sur les étapes suivantes
    }
  }

  // 2. Code INSEE (ex: "62119" pour Béthune)
  if (offre.codeInsee) {
    return zone.codes.has(offre.codeInsee) ? "oui" : "non";
  }

  // 3. Ville textuelle
  if (offre.ville) {
    // Vérifier si un code postal 5 chiffres apparaît (ex: "62400", "62190")
    const cpMatch = offre.ville.match(/\b\d{5}\b/);
    if (cpMatch && zone.cps.has(cpMatch[0])) {
      return "oui";
    }

    // Nettoyer la ville : retirer parenthèses, codes postaux, départements
    const cleaned = offre.ville.replace(/\(.*?\)|\b\d{2,5}\b/g, "");
    const parts = cleaned.split(/[,/—•|:]/).map((p) => norm(p)).filter(Boolean);
    const full = norm(cleaned);

    const candidates = [full, ...parts];
    for (const cand of candidates) {
      if (zone.noms.has(cand)) {
        return "oui";
      }
    }

    // Vérifier si un des mots de commune dans la zone apparaît dans full
    // (ex: "arras" dans "dipn62 arras", ou "lens" dans "route de la bassee lens")
    const words = full.split(/\s+/).filter((w) => w.length >= 3);
    for (const w of words) {
      if (zone.noms.has(w)) {
        return "oui";
      }
    }

    // Si le nom extrait contient une région générique comme "Pas-de-Calais"
    if (REGIONS_GENERIQUES.has(full) || Array.from(REGIONS_GENERIQUES).some((r) => full === r || full.endsWith(r))) {
      return "inconnu";
    }

    // Une ville identifiée mais absente de la zone (ex: "Paris", "Toulouse", "Nanterre")
    if (full.length > 2) {
      return "non";
    }
  }

  return "inconnu";
}
