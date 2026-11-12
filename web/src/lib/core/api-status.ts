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
    const spName = fs
      .readdirSync(cacheDir)
      .filter((f) => f.startsWith("service-public-") && f.endsWith(".json"))
      .sort((a, b) => b.length - a.length)[0];
    const spCache = path.join(cacheDir, spName || "service-public-62.json");
    if (fs.existsSync(spCache)) {
      const data = JSON.parse(fs.readFileSync(spCache, "utf8"));
      if (Array.isArray(data)) {
        spDetail = `En ligne (data.gouv.fr) · ${data.length} offres de la zone en cache (tous métiers)`;
      }
    }
  } catch {}

  // 2. WTTJ
  const wttjDetail = "En ligne · interrogé avec les postes de votre profil, sans clé";

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
      description: "Flux open data officiel : État, collectivités, mairies, hôpitaux — tous métiers, dans les départements de votre zone",
      category: "Gouvernement & Open Data",
      status: "live",
      detail: spDetail,
      free: true,
      docUrl: "https://choisirleservicepublic.gouv.fr",
    },
    {
      id: "wttj",
      name: "Welcome to the Jungle (WTTJ France)",
      description: "Entreprises qui recrutent sur Welcome to the Jungle, cherchées avec les postes de votre profil",
      category: "Agrégateurs & PME",
      status: "live",
      detail: wttjDetail,
      free: true,
      docUrl: "https://www.welcometothejungle.com",
    },
    {
      id: "meteojob",
      name: "Meteojob",
      description: "Job board généraliste très fourni en intérim (Adecco, Synergie, Aquila RH…) et en CDI/CDD de PME, autour de votre commune",
      category: "Agrégateurs & PME",
      status: "live",
      detail: "En ligne · sans clé · recherche par poste et missions d'intérim de la zone",
      free: true,
      docUrl: "https://www.meteojob.com",
    },
    {
      id: "france-travail",
      name: "France Travail API v2 (Offres d'emploi)",
      description: "API nationale officielle : offres directes d'entreprises + partenaires (HelloWork, Meteojob, Apec)",
      category: "Gouvernement & Open Data",
      status: hasFt ? "configured" : "unconfigured",
      detail: hasFt
        ? "Clés actives · recherche autour de la commune de chaque profil, par mots-clés puis par code métier (ROME)"
        : "Non configuré · Clés 100% gratuites sur francetravail.io (Espace Développeurs)",
      free: true,
      docUrl: "https://francetravail.io",
      envKeys: ["FRANCETRAVAIL_CLIENT_ID", "FRANCETRAVAIL_CLIENT_SECRET"],
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
      description: "Job boards, intérim et sites carrières indexés, recherche par rayon autour de votre commune",
      category: "Agrégateurs & PME",
      status: hasAdzuna ? "configured" : "unconfigured",
      detail: hasAdzuna
        ? "Clés actives · recherche par rayon autour de la commune de chaque profil"
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
        ? "Identifiant actif · recherche dans les villes principales de votre zone"
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
