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

  // 2. WTTJ
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
  // 3. France Travail
  const hasFt = Boolean(env.FRANCETRAVAIL_CLIENT_ID?.trim() && env.FRANCETRAVAIL_CLIENT_SECRET?.trim());

  // 4. Jooble
  const hasJooble = Boolean(env.JOOBLE_API_KEY?.trim());
  const hasAdzuna = Boolean(env.ADZUNA_APP_ID?.trim() && env.ADZUNA_APP_KEY?.trim());
  const hasCareerjet = Boolean(env.CAREERJET_AFFID?.trim());

  const list: ApiInfo[] = [
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
        ? "Clés API actives dans .env · Recherche par rayon autour de Lières (62 + 59)"
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
      id: "adzuna",
      name: "Adzuna API (agrégateur France)",
      description: "Job boards, intérim et sites carrières indexés, recherche par rayon autour de Lillers",
      category: "Agrégateurs & PME",
      status: hasAdzuna ? "configured" : "unconfigured",
      detail: hasAdzuna
        ? "Clés API actives dans .env · Recherche par rayon autour de Lillers"
        : "Optionnel · Clés gratuites sur developer.adzuna.com",
      free: true,
      docUrl: "https://developer.adzuna.com",
      envKeys: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
    },
    {
      id: "careerjet",
      name: "Careerjet / Optioncarrière API",
      description: "Agrégateur de milliers de sites d'emploi et d'intérim, refiltré sur ta zone de trajet",
      category: "Agrégateurs & PME",
      status: hasCareerjet ? "configured" : "unconfigured",
      detail: hasCareerjet
        ? "affid actif dans .env · Recherche Béthune / Lillers / Lens"
        : "Optionnel · Identifiant partenaire gratuit sur careerjet.fr",
      free: true,
      docUrl: "https://www.careerjet.fr/partenaires/api/",
      envKeys: ["CAREERJET_AFFID"],
    },
    {
      id: "ats-networks",
      name: "Employeurs régionaux & ATS publics (SmartRecruiters, Teamtailor, Workday…)",
      description: "Sites carrières des employeurs du Nord-Pas-de-Calais suivis dans portals.yml + Workday",
      category: "Réseaux ATS",
      status: "live",
      detail: "Actif · 0 token LLM consommé (reverse discovery native)",
      free: true,
    },
  ];

  return list.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
}
