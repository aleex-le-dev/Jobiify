import fs from 'node:fs';
import * as yaml from 'js-yaml';

const filePath = 'portals.yml';
const doc = yaml.load(fs.readFileSync(filePath, 'utf8'));

// 1. Mise à jour de location_filter pour couvrir toutes les villes autour de Lières
const localCities = [
  "Lières", "Lieres",
  "Béthune", "Bethune",
  "Bruay-la-Buissière", "Bruay",
  "Aire-sur-la-Lys", "Aire sur la Lys",
  "Saint-Omer", "Saint Omer", "Arques",
  "Lens", "Liévin", "Lievin", "Hénin-Beaumont",
  "Arras",
  "Douai",
  "Lille", "Roubaix", "Tourcoing", "Villeneuve d'Ascq", "Lesquin", "Ronchin", "Seclin",
  "Lestrem",
  "Pas-de-Calais", "62",
  "Nord", "59",
  "Hauts-de-France",
  "France",
  "Télétravail", "Teletravail", "Remote"
];

doc.location_filter = {
  always_allow: localCities,
  allow: localCities,
  block: [
    "United States", "USA", "India", "Bengaluru", "United Kingdom", "London",
    "Germany", "Berlin", "Singapore", "Japan", "Brazil", "Australia", "Canada"
  ]
};

// 2. Requêtes ciblées sur TOUS les employeurs dans les grandes villes autour de chez lui
doc.search_queries = [
  {
    name: "HelloWork — Béthune, Bruay, Lens, Saint-Omer & Environs",
    query: 'site:hellowork.com/fr-fr/emplois ("Développeur Web" OR "Technicien Informatique" OR "Support Informatique" OR "Gestion de parc" OR "Maintenance informatique") ("Béthune" OR "Bruay" OR "Lens" OR "Saint-Omer" OR "Aire-sur-la-Lys" OR "Lières" OR "Pas-de-Calais")',
    enabled: true
  },
  {
    name: "HelloWork — Métropole Lilloise & Arras (Lille, Roubaix, Arras, Douai)",
    query: 'site:hellowork.com/fr-fr/emplois ("Développeur Web" OR "Technicien Informatique" OR "Technicien Support" OR "Développeur PHP" OR "Développeur React") ("Lille" OR "Arras" OR "Villeneuve d\'Ascq" OR "Roubaix" OR "Douai" OR "Nord")',
    enabled: true
  },
  {
    name: "France Travail — PME, Collectivités & Hôpitaux (62 & 59)",
    query: 'site:candidat.francetravail.fr/offres ("Développeur" OR "Technicien informatique" OR "Support informatique" OR "Maintenance") ("Béthune" OR "Lens" OR "Lille" OR "Arras" OR "Saint-Omer" OR "62" OR "59")',
    enabled: true
  },
  {
    name: "Apec — Cadres & Techniciens Supérieurs IT (Hauts-de-France)",
    query: 'site:apec.fr/candidat/recherche-emploi.html ("Développeur Web" OR "Technicien Informatique" OR "Support Informatique" OR "Référent Digital") ("Béthune" OR "Lens" OR "Lille" OR "Arras" OR "Hauts-de-France")',
    enabled: true
  },
  {
    name: "Grands Employeurs Régionaux (Decathlon, Leroy Merlin, OVH, Roquette, Boulanger, ESN)",
    query: '("Decathlon" OR "Leroy Merlin" OR "Adeo" OR "OVHcloud" OR "Roquette" OR "Boulanger" OR "Econocom" OR "Inetum" OR "Capgemini" OR "Sopra Steria") ("Développeur" OR "Technicien informatique" OR "Support" OR "Gestion de parc") ("Lille" OR "Béthune" OR "Lens" OR "Lestrem" OR "Arras" OR "Lesquin" OR "Roubaix")',
    enabled: true
  },
  {
    name: "Secteur Public & Santé (Hôpitaux, Mairies, Agglomérations 62/59)",
    query: '("Centre Hospitalier" OR "Hôpital" OR "Mairie" OR "Agglomération" OR "Département" OR "Région") ("Technicien informatique" OR "Support informatique" OR "Développeur web") ("Béthune" OR "Lens" OR "Lille" OR "Arras" OR "Saint-Omer" OR "Pas-de-Calais")',
    enabled: true
  },
  {
    name: "Welcome to the Jungle — Tech, Web & Startups (Lille & Télétravail)",
    query: 'site:welcometothejungle.com/fr/companies ("Développeur Web" OR "Technicien Informatique" OR "Support IT" OR "Webmaster") ("Lille" OR "Hauts-de-France" OR "Télétravail")',
    enabled: true
  }
];

// 3. Grands employeurs régionaux + entreprises télétravail dans tracked_companies
const regionalAndNationalCompanies = [
  // --- Grands employeurs des Hauts-de-France & région de Béthune / Lille ---
  {
    name: "Roquette Frères (Lestrem / Béthune)",
    careers_url: "https://careers.roquette.com",
    scan_method: "websearch",
    scan_query: 'site:careers.roquette.com ("informatique" OR "IT" OR "Support" OR "Systèmes")',
    enabled: true,
    notes: "Site industriel majeur à Lestrem (15 min de Lières / Béthune). Équipes IT et support industriel."
  },
  {
    name: "Decathlon (Villeneuve d'Ascq / Campus Lille)",
    careers_url: "https://recrutement.decathlon.fr",
    scan_method: "websearch",
    scan_query: 'site:recrutement.decathlon.fr ("Développeur" OR "Technicien" OR "Support" OR "Informatique")',
    enabled: true,
    notes: "Siège mondial et campus IT à Villeneuve d'Ascq. Nombreux postes web, support et gestion de parc."
  },
  {
    name: "Adeo / Leroy Merlin (Ronchin / Lille)",
    careers_url: "https://adeo.wd3.myworkdayjobs.com/LeroyMerlin_France",
    scan_method: "websearch",
    scan_query: 'site:adeo.wd3.myworkdayjobs.com ("Développeur" OR "Technicien" OR "Support" OR "Informatique")',
    enabled: true,
    notes: "Siège à Ronchin / Lesquin. Énorme pôle IT retail, e-commerce, support utilisateurs et parcs."
  },
  {
    name: "OVHcloud (Roubaix / Lille)",
    careers_url: "https://careers.ovhcloud.com/fr/",
    scan_method: "websearch",
    scan_query: 'site:careers.ovhcloud.com ("Support" OR "Technicien" OR "Développeur" OR "Web")',
    enabled: true,
    notes: "Siège mondial à Roubaix. Hébergement, infrastructure web, support technique N1/N2."
  },
  {
    name: "Boulanger (Lesquin / Lille)",
    careers_url: "https://recrutement.boulanger.com",
    scan_method: "websearch",
    scan_query: 'site:recrutement.boulanger.com ("Informatique" OR "Développeur" OR "Support")',
    enabled: true,
    notes: "Siège à Lesquin. Pôle e-commerce web et DSI support magasins/siège."
  },
  {
    name: "Econocom (Lesquin / Lille)",
    careers_url: "https://carrieres.econocom.com",
    scan_method: "websearch",
    scan_query: 'site:carrieres.econocom.com ("Technicien" OR "Support" OR "Poste de travail" OR "Parc") ("Lille" OR "Lesquin" OR "Nord")',
    enabled: true,
    notes: "Leader européen des services IT, infogérance, déploiement de parcs et support N1/N2 à Lesquin."
  },
  {
    name: "Inetum (Lille / Villeneuve d'Ascq)",
    careers_url: "https://inetum.com/fr/carrieres",
    scan_method: "websearch",
    scan_query: 'site:inetum.com ("Technicien" OR "Support" OR "Développeur Web") ("Lille" OR "Nord")',
    enabled: true,
    notes: "ESN majeure implantée à Lille. Support utilisateurs, maintenance et développement web."
  },
  {
    name: "Capgemini (Euratechnologies Lille)",
    careers_url: "https://www.capgemini.com/fr-fr/carrieres/",
    scan_method: "websearch",
    scan_query: 'site:capgemini.com ("Développeur" OR "Support" OR "Technicien") ("Lille" OR "Hauts-de-France")',
    enabled: true,
    notes: "Pôle majeur à Euratechnologies Lille. Projets applicatifs web et infogérance."
  },
  // --- Entreprises nationales tech avec ATS directs & postes Télétravail / France ---
  {
    name: "Doctolib",
    careers_url: "https://job-boards.greenhouse.io/doctolib",
    provider: "greenhouse",
    enabled: true,
    notes: "Plateforme e-santé France. Équipes web et support technique."
  },
  {
    name: "Alan",
    careers_url: "https://jobs.ashbyhq.com/alan",
    provider: "ashby",
    enabled: true,
    notes: "Assurance santé digitale. Recrutement web et support."
  },
  {
    name: "Qonto",
    careers_url: "https://jobs.ashbyhq.com/qonto",
    provider: "ashby",
    enabled: true,
    notes: "Fintech B2B France. Postes web et support IT."
  },
  {
    name: "Pennylane",
    careers_url: "https://jobs.ashbyhq.com/pennylane",
    provider: "ashby",
    enabled: true,
    notes: "SaaS comptabilité & gestion. Postes full remote France."
  },
  {
    name: "Swile",
    careers_url: "https://jobs.lever.co/swile",
    provider: "lever",
    enabled: true,
    notes: "Avantages salariés & tech. Postes développeur et support."
  },
  {
    name: "Mirakl",
    careers_url: "https://job-boards.greenhouse.io/mirakl",
    provider: "greenhouse",
    enabled: true,
    notes: "Leader marketplace e-commerce en France."
  },
  {
    name: "Back Market",
    careers_url: "https://jobs.ashbyhq.com/backmarket",
    provider: "ashby",
    enabled: true,
    notes: "Reconditionné leader France. Tech e-commerce et support."
  },
  {
    name: "BlaBlaCar",
    careers_url: "https://jobs.lever.co/blablacar",
    provider: "lever",
    enabled: true,
    notes: "Mobilité leader France. Équipes web et support."
  },
  {
    name: "Contentsquare",
    careers_url: "https://jobs.lever.co/contentsquare",
    provider: "lever",
    enabled: true,
    notes: "Expérience digitale & UX web. Postes tech et support."
  },
  {
    name: "Malt",
    careers_url: "https://jobs.lever.co/malt",
    provider: "lever",
    enabled: true,
    notes: "Plateforme freelance France. Postes tech et support."
  }
];

// Conserver les anciennes entreprises désactivées à la suite
const existingDisabled = (doc.tracked_companies || []).filter(c => !regionalAndNationalCompanies.some(r => r.name === c.name));
for (const c of existingDisabled) {
  c.enabled = false;
}

doc.tracked_companies = [...regionalAndNationalCompanies, ...existingDisabled];

// Écriture du fichier mis à jour
const newYaml = yaml.dump(doc, { lineWidth: -1, noRefs: true });
fs.writeFileSync(filePath, newYaml, 'utf8');

console.log('portals.yml successfully configured for local region!');
console.log('Tracked active employers:', regionalAndNationalCompanies.length);
console.log('Active local search queries:', doc.search_queries.length);
