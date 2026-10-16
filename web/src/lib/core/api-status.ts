import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { getEffectiveEnv } from "@/lib/core/env-config";

export type ApiInfo = {
  id: string;
  name: string;
  description: string;
  category: "Gouvernement & Open Data" | "Agrégateurs & PME" | "Réseaux ATS";
  status: "live" | "configured" | "unconfigured" | "broken";
  detail: string;
  free: boolean;
  docUrl?: string;
  envKeys?: string[];
};

export function getApisStatus(): ApiInfo[] {
  const root = careerOpsRoot();
  const cacheDir = path.join(root, "data", "cache");

  // 1. Service public & emploi territorial
  let spDetail = "En ligne (data.gouv.fr) · Prêt pour la synchronisation";
  try {
    const spCache = path.join(cacheDir, "service-public-62.json");
    if (fs.existsSync(spCache)) {
      const data = JSON.parse(fs.readFileSync(spCache, "utf8"));
      if (Array.isArray(data)) {
        spDetail = `En ligne (data.gouv.fr) · ${data.length} offres locales 62 en cache actif`;
      }
    }
  } catch {}

  // 2. Sirene IT PME 62
  let sireneDetail = "En ligne (INSEE) · Prêt pour la cartographie";
  try {
    const sireneCache = path.join(cacheDir, "sirene-it-62.json");
    if (fs.existsSync(sireneCache)) {
      const data = JSON.parse(fs.readFileSync(sireneCache, "utf8"));
      if (Array.isArray(data)) {
        sireneDetail = `En ligne (INSEE) · ${data.length} PME informatiques locales cartographiées à proximité`;
      }
    }
  } catch {}

  // 3. WTTJ
  let wttjDetail = "En ligne (Algolia France) · Requêtes temps réel sans token";
  try {
    const wttjCache = path.join(cacheDir, "wttj-fr.json");
    if (fs.existsSync(wttjCache)) {
      const data = JSON.parse(fs.readFileSync(wttjCache, "utf8"));
      if (Array.isArray(data)) {
        wttjDetail = `En ligne (Algolia France) · ${data.length} offres tech et PME en cache actif`;
      }
    }
  } catch {}

  const env = getEffectiveEnv();
  // 4. France Travail
  const hasFt = Boolean(env.FRANCETRAVAIL_CLIENT_ID?.trim() && env.FRANCETRAVAIL_CLIENT_SECRET?.trim());

  // 5. Jooble
  const hasJooble = Boolean(env.JOOBLE_API_KEY?.trim());

  return [
    {
      id: "service-public",
      name: "Choisir le Service Public & Emploi Territorial",
      description: "Flux Open Data officiel de l'État pour les postes territoriaux, mairies, hôpitaux et SDIS 62",
      category: "Gouvernement & Open Data",
      status: "live",
      detail: spDetail,
      free: true,
      docUrl: "https://choisirleservicepublic.gouv.fr",
    },
    {
      id: "sirene-it",
      name: "Répertoire SIRENE — PME & Artisans IT du 62",
      description: "Cartographie officielle INSEE de toutes les entreprises et prestataires informatiques locaux",
      category: "Gouvernement & Open Data",
      status: "live",
      detail: sireneDetail,
      free: true,
      docUrl: "https://annuaire-entreprises.data.gouv.fr",
    },
    {
      id: "wttj",
      name: "Welcome to the Jungle (WTTJ France)",
      description: "API de recherche Algolia des entreprises numériques, PME innovantes et scale-ups",
      category: "Agrégateurs & PME",
      status: "live",
      detail: wttjDetail,
      free: true,
      docUrl: "https://www.welcometothejungle.com",
    },
    {
      id: "france-travail",
      name: "France Travail API v2 (Offres d'emploi)",
      description: "API nationale officielle : offres directes d'entreprises + partenaires (HelloWork, Meteojob, Apec)",
      category: "Gouvernement & Open Data",
      status: hasFt ? "configured" : "unconfigured",
      detail: hasFt
        ? "Clés API actives dans .env · Synchronisation Pas-de-Calais activée"
        : "Non configuré · Clés 100% gratuites sur francetravail.io (Espace Développeurs)",
      free: true,
      docUrl: "https://francetravail.io",
      envKeys: ["FRANCETRAVAIL_CLIENT_ID", "FRANCETRAVAIL_CLIENT_SECRET"],
    },
    {
      id: "la-bonne-boite",
      name: "La Bonne Boîte (France Travail)",
      description: "Algorithme prédictif officiel détectant les PME/TPE du 62 avec fort potentiel d'embauche immédiat",
      category: "Gouvernement & Open Data",
      status: hasFt ? "configured" : "unconfigured",
      detail: hasFt
        ? "Connecté avec vos identifiants France Travail · Détection du marché caché 62"
        : "Partage vos identifiants gratuits France Travail",
      free: true,
      docUrl: "https://labonneboite.francetravail.fr",
    },
    {
      id: "jooble",
      name: "Jooble API (PME & Cabinets régionaux)",
      description: "Spécialiste de l'indexation directe des sites carrières de petites entreprises locales",
      category: "Agrégateurs & PME",
      status: hasJooble ? "configured" : "unconfigured",
      detail: hasJooble
        ? "Clé API active dans .env · Agrégation PME locale connectée"
        : "Optionnel · Clé gratuite immédiate sur jooble.org/api/about",
      free: true,
      docUrl: "https://jooble.org/api/about",
      envKeys: ["JOOBLE_API_KEY"],
    },
    {
      id: "ats-networks",
      name: "Réseaux ATS Publics (Workday, Greenhouse, Lever, Ashby)",
      description: "Moteurs de détection inversée sur les serveurs carrières des grandes entreprises",
      category: "Réseaux ATS",
      status: "live",
      detail: "Actif · 0 token LLM consommé (reverse discovery native)",
      free: true,
    },
  ];
}
