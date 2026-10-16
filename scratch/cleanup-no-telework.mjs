import fs from 'node:fs';
import * as yaml from 'js-yaml';

const filePath = 'portals.yml';
const doc = yaml.load(fs.readFileSync(filePath, 'utf8'));

// 1. Filtrage géographique : 100% LOCAL (ZÉRO TÉLÉTRAVAIL, ZÉRO LILLE)
const localLocationsOnly = [
  "Lières", "Lieres",
  "Lillers",
  "Auchel",
  "Béthune", "Bethune",
  "Bruay-la-Buissière", "Bruay", "Bruay-en-Artois",
  "Aire-sur-la-Lys", "Aire sur la Lys",
  "Saint-Omer", "Saint Omer", "Arques",
  "Lens", "Liévin", "Lievin", "Hénin-Beaumont",
  "Arras",
  "Lestrem",
  "Noeux-les-Mines",
  "Isbergues",
  "Pas-de-Calais", "62"
];

const blockedLocations = [
  // Interdiction de Lille et sa métropole
  "Lille", "Roubaix", "Tourcoing", "Villeneuve d'Ascq", "Villeneuve-d'Ascq",
  "Lesquin", "Seclin", "Ronchin", "Marcq-en-Baroeul",
  // Pays étrangers
  "United States", "USA", "India", "Bengaluru", "United Kingdom", "London",
  "Germany", "Berlin", "Singapore", "Japan", "Brazil", "Australia", "Canada"
];

doc.location_filter = {
  always_allow: localLocationsOnly,
  allow: localLocationsOnly,
  block: blockedLocations
};

// 2. Requêtes de recherche 100% locales et fonction publique / emploi territorial
doc.search_queries = [
  {
    name: "Emploi Territorial (Mairies, Agglomérations, CDG 62)",
    query: 'site:emploi-territorial.fr ("Technicien informatique" OR "Support informatique" OR "Systèmes et réseaux" OR "Développeur" OR "Gestion de parc" OR "Informatique") ("62" OR "Pas-de-Calais" OR "Béthune" OR "Lens" OR "Arras" OR "Saint-Omer" OR "Lillers" OR "Bruay")',
    enabled: true
  },
  {
    name: "Choisir le Service Public (Gouvernement / État 62)",
    query: 'site:choisirleservicepublic.gouv.fr ("Technicien informatique" OR "Support informatique" OR "Informatique" OR "Développeur" OR "Numérique") ("Pas-de-Calais" OR "Béthune" OR "Lens" OR "Arras" OR "Saint-Omer" OR "62")',
    enabled: true
  },
  {
    name: "Région Hauts-de-France & Département du Pas-de-Calais (Lycées, Collèges, Services 62)",
    query: '(site:hautsdefrance.fr OR site:pasdecalais.fr OR site:cdg62.fr) ("Technicien informatique" OR "Support informatique" OR "Informatique" OR "Gestion de parc" OR "Webmestre") ("Pas-de-Calais" OR "Béthune" OR "Arras" OR "Lens" OR "Saint-Omer")',
    enabled: true
  },
  {
    name: "Agglomérations & Mairies (CABBALR Béthune-Bruay, CALL Lens, CAPSO, Arras)",
    query: '(site:bethunebruay.fr OR site:agglo-lenslievin.fr OR site:ca-pso.fr OR site:bruaylabuissiere.fr OR site:arras.fr) ("Informatique" OR "Technicien" OR "Support" OR "Web" OR "Numérique")',
    enabled: true
  },
  {
    name: "Centres Hospitaliers locaux (Béthune-Beuvry, Lens, Saint-Omer, Arras)",
    query: '(site:ch-bethune.fr OR site:ch-lens.fr OR site:ch-stomer.fr OR site:ch-arras.fr) ("Informatique" OR "Technicien" OR "Support" OR "Maintenance informatique")',
    enabled: true
  },
  {
    name: "HelloWork — Bassin Béthune, Bruay, Lillers, Saint-Omer, Lens, Arras (Sur site uniquement, SANS LILLE)",
    query: 'site:hellowork.com/fr-fr/emplois ("Développeur Web" OR "Technicien Informatique" OR "Support Informatique" OR "Gestion de parc") ("Béthune" OR "Bruay" OR "Lillers" OR "Saint-Omer" OR "Aire-sur-la-Lys" OR "Lières" OR "Lens" OR "Arras") -Lille',
    enabled: true
  },
  {
    name: "France Travail — Pas-de-Calais 62 (Sur site uniquement, SANS LILLE)",
    query: 'site:candidat.francetravail.fr/offres ("Développeur" OR "Technicien informatique" OR "Support informatique" OR "Maintenance") ("Béthune" OR "Bruay" OR "Lens" OR "Arras" OR "Saint-Omer" OR "Lillers" OR "Aire-sur-la-Lys" OR "62") -Lille',
    enabled: true
  }
];

// 3. Uniquement des employeurs sur site dans votre secteur (Secteur public, collectivités, hôpitaux, industrie locale)
const localEmployersOnly = [
  {
    name: "Communauté d'Agglomération Béthune-Bruay (CABBALR)",
    careers_url: "https://emploi.bethunebruay.fr",
    scan_method: "websearch",
    scan_query: 'site:emploi.bethunebruay.fr OR site:bethunebruay.fr ("Informatique" OR "Technicien" OR "Support" OR "Web" OR "Numérique")',
    enabled: true,
    notes: "Agglomération de rattachement direct (Lières, Lillers, Béthune, Bruay). DSI et services numériques."
  },
  {
    name: "Centre Hospitalier de Béthune Beuvry",
    careers_url: "https://www.ch-bethune.fr/nos-offres-demploi/",
    scan_method: "websearch",
    scan_query: 'site:ch-bethune.fr ("Informatique" OR "Technicien" OR "Support" OR "Parc")',
    enabled: true,
    notes: "Hôpital public principal du secteur de Béthune. Support informatique et parcs utilisateurs."
  },
  {
    name: "Centre Hospitalier de Lens",
    careers_url: "https://www.ch-lens.fr/nous-rejoindre/",
    scan_method: "websearch",
    scan_query: 'site:ch-lens.fr ("Informatique" OR "Technicien" OR "Support" OR "Systèmes")',
    enabled: true,
    notes: "Hôpital de Lens. Pôle informatique et gestion de parc."
  },
  {
    name: "Centre Hospitalier d'Arras",
    careers_url: "https://www.ch-arras.fr",
    scan_method: "websearch",
    scan_query: 'site:ch-arras.fr ("Informatique" OR "Technicien" OR "Support")',
    enabled: true,
    notes: "Hôpital d'Arras. Pôle informatique et réseau."
  },
  {
    name: "Département du Pas-de-Calais (Arras / Béthune)",
    careers_url: "https://www.pasdecalais.fr/le-departement-recrute",
    scan_method: "websearch",
    scan_query: 'site:pasdecalais.fr ("Informatique" OR "Technicien" OR "Support" OR "Développeur")',
    enabled: true,
    notes: "Conseil départemental du Pas-de-Calais (collèges, services sociaux et DSI)."
  },
  {
    name: "Région Hauts-de-France (Lycées et Services déconcentrés 62)",
    careers_url: "https://recrutement.hautsdefrance.fr",
    scan_method: "websearch",
    scan_query: 'site:recrutement.hautsdefrance.fr ("Informatique" OR "Technicien" OR "Support" OR "Maintenance") ("62" OR "Pas-de-Calais" OR "Béthune" OR "Lens" OR "Arras")',
    enabled: true,
    notes: "Région Hauts-de-France (support et maintenance informatique lycées et services 62)."
  },
  {
    name: "Centre de Gestion de la FPT du Pas-de-Calais (CDG 62)",
    careers_url: "https://www.cdg62.fr/emploi",
    scan_method: "websearch",
    scan_query: 'site:cdg62.fr ("Technicien informatique" OR "Support" OR "Informatique" OR "Parc")',
    enabled: true,
    notes: "Bourse de l'emploi territorial pour toutes les collectivités et mairies du Pas-de-Calais."
  },
  {
    name: "Communauté d'Agglomération de Lens-Liévin (CALL)",
    careers_url: "https://www.agglo-lenslievin.fr",
    scan_method: "websearch",
    scan_query: 'site:agglo-lenslievin.fr ("Informatique" OR "Technicien" OR "Support")',
    enabled: true,
    notes: "Agglomération de Lens-Liévin. DSI territoriale et parcs."
  },
  {
    name: "Communauté d'Agglomération du Pays de Saint-Omer (CAPSO)",
    careers_url: "https://www.ca-pso.fr",
    scan_method: "websearch",
    scan_query: 'site:ca-pso.fr ("Informatique" OR "Technicien" OR "Support")',
    enabled: true,
    notes: "Agglomération de Saint-Omer (25 km de Lières). DSI et services informatiques."
  },
  {
    name: "Ville de Bruay-la-Buissière",
    careers_url: "https://www.bruaylabuissiere.fr",
    scan_method: "websearch",
    scan_query: 'site:bruaylabuissiere.fr ("Informatique" OR "Technicien" OR "Support")',
    enabled: true,
    notes: "Mairie de Bruay-la-Buissière. Service informatique municipal."
  },
  {
    name: "Ville d'Arras",
    careers_url: "https://www.arras.fr",
    scan_method: "websearch",
    scan_query: 'site:arras.fr ("Informatique" OR "Technicien" OR "Support")',
    enabled: true,
    notes: "Mairie d'Arras. Services informatiques et télécoms."
  },
  {
    name: "SDIS 62 (Sapeurs-Pompiers du Pas-de-Calais)",
    careers_url: "https://www.sdis62.fr",
    scan_method: "websearch",
    scan_query: 'site:sdis62.fr ("Informatique" OR "Technicien" OR "Support")',
    enabled: true,
    notes: "Service départemental d'incendie et de secours du 62. DSI et support de tous les centres de secours."
  },
  {
    name: "Roquette Frères (Lestrem / Béthune)",
    careers_url: "https://www.roquette.com/fr/carrieres",
    scan_method: "websearch",
    scan_query: 'site:roquette.com ("informatique" OR "IT" OR "Support" OR "Systèmes")',
    enabled: true,
    notes: "Site industriel de Lestrem à 15 min de Lières. Pôle IT et support industriel."
  },
  {
    name: "Arc France (Arques / Saint-Omer)",
    careers_url: "https://www.arc-intl.com",
    scan_method: "websearch",
    scan_query: 'site:arc-intl.com ("Informatique" OR "Technicien" OR "Support" OR "Web")',
    enabled: true,
    notes: "Site industriel majeur à Arques (20 min de Lières). Support informatique et systèmes."
  }
];

// Remplacer tracked_companies : AUCUN portail de télétravail, AUCUN portail en pause
doc.tracked_companies = localEmployersOnly;
doc.job_boards = [];

const newYaml = yaml.dump(doc, { lineWidth: -1, noRefs: true });
fs.writeFileSync(filePath, newYaml, 'utf8');

console.log('portals.yml updated: ZERO TELEWORK, 100% LOCAL SECTOR!');
console.log('Tracked local employers:', localEmployersOnly.length);
console.log('Paused companies: 0');
