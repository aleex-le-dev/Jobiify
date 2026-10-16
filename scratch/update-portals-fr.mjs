import fs from 'node:fs';
import * as yaml from 'js-yaml';

const filePath = 'portals.yml';
let raw = fs.readFileSync(filePath, 'utf8');

// 1. Liste des entreprises françaises vérifiées avec ATS actif (Greenhouse, Ashby, Lever)
const frenchCompanies = [
  {
    name: 'Doctolib',
    careers_url: 'https://job-boards.greenhouse.io/doctolib',
    provider: 'greenhouse',
    enabled: true,
    notes: 'Plateforme e-santé France. Équipes tech web et support.'
  },
  {
    name: 'Alan',
    careers_url: 'https://jobs.ashbyhq.com/alan',
    provider: 'ashby',
    enabled: true,
    notes: 'Assurance santé digitale France. Recrutement web et support.'
  },
  {
    name: 'Qonto',
    careers_url: 'https://jobs.ashbyhq.com/qonto',
    provider: 'ashby',
    enabled: true,
    notes: 'Fintech B2B France. Postes web, infra et support IT.'
  },
  {
    name: 'Swile',
    careers_url: 'https://jobs.lever.co/swile',
    provider: 'lever',
    enabled: true,
    notes: 'Avantages salariés & tech France. Postes développeur et support.'
  },
  {
    name: 'Pennylane',
    careers_url: 'https://jobs.ashbyhq.com/pennylane',
    provider: 'ashby',
    enabled: true,
    notes: 'Gestion financière & compta SaaS. Postes web et télétravail France.'
  },
  {
    name: 'Mirakl',
    careers_url: 'https://job-boards.greenhouse.io/mirakl',
    provider: 'greenhouse',
    enabled: true,
    notes: 'Leader des solutions marketplace e-commerce en France.'
  },
  {
    name: 'Contentsquare',
    careers_url: 'https://jobs.lever.co/contentsquare',
    provider: 'lever',
    enabled: true,
    notes: 'Analytics UX web et expérience digitale. Postes tech et support.'
  },
  {
    name: 'Back Market',
    careers_url: 'https://jobs.ashbyhq.com/backmarket',
    provider: 'ashby',
    enabled: true,
    notes: 'Reconditionné leader France. Tech e-commerce et support.'
  },
  {
    name: 'BlaBlaCar',
    careers_url: 'https://jobs.lever.co/blablacar',
    provider: 'lever',
    enabled: true,
    notes: 'Mobilité leader France. Équipes développement web et support.'
  },
  {
    name: 'Malt',
    careers_url: 'https://jobs.lever.co/malt',
    provider: 'lever',
    enabled: true,
    notes: 'Plateforme freelance leader en France. Postes tech et opérations.'
  },
  {
    name: 'Vestiaire Collective',
    careers_url: 'https://jobs.lever.co/vestiairecollective',
    provider: 'lever',
    enabled: true,
    notes: 'E-commerce mode, postes développement web et support.'
  },
  {
    name: 'Lumapps',
    careers_url: 'https://jobs.lever.co/lumapps',
    provider: 'lever',
    enabled: true,
    notes: 'Intranet & digital workplace pour entreprises.'
  },
  {
    name: 'Voodoo',
    careers_url: 'https://jobs.ashbyhq.com/voodoo',
    provider: 'ashby',
    enabled: true,
    notes: 'Éditeur d applications et jeux mobiles. Équipes tech et dev.'
  }
];

// 2. Requêtes de recherche ciblées France & Hauts-de-France
const frenchSearchQueries = [
  {
    name: 'Welcome to the Jungle — Développeur Web & Support IT',
    query: 'site:welcometothejungle.com/fr/companies ("Développeur Web" OR "Technicien Informatique" OR "Développeur PHP" OR "Développeur React") France',
    enabled: true
  },
  {
    name: 'Greenhouse — Développeur Web & Support IT (France)',
    query: 'site:boards.greenhouse.io OR site:job-boards.greenhouse.io ("Développeur Web" OR "Technicien Informatique" OR "Technicien Support" OR "Web Developer") (France OR Lille OR Béthune OR Remote)',
    enabled: true
  },
  {
    name: 'Lever — Développeur Web & Support IT (France)',
    query: 'site:jobs.lever.co ("Développeur Web" OR "Technicien Informatique" OR "Web Developer" OR "Support IT") (France OR Lille OR Remote)',
    enabled: true
  },
  {
    name: 'Ashby — Développeur Web & Support IT (France)',
    query: 'site:jobs.ashbyhq.com ("Développeur Web" OR "Technicien Informatique" OR "Frontend" OR "Fullstack") (France OR Remote)',
    enabled: true
  },
  {
    name: 'HelloWork — Hauts-de-France (Béthune, Lens, Lille, Arras)',
    query: 'site:hellowork.com/fr-fr/emplois ("Développeur Web" OR "Technicien Informatique" OR "Support Informatique") ("Béthune" OR "Lens" OR "Lille" OR "Arras" OR "Pas-de-Calais" OR "Hauts-de-France")',
    enabled: true
  },
  {
    name: 'Apec — Développeur Web & Support IT (Hauts-de-France & Télétravail)',
    query: 'site:apec.fr/candidat/recherche-emploi.html ("Développeur Web" OR "Technicien Informatique") ("Hauts-de-France" OR "Lille" OR "Pas-de-Calais" OR "Télétravail")',
    enabled: true
  }
];

// Parser et modifier via YAML
const doc = yaml.load(raw);

// Désactiver toutes les anciennes requêtes
if (Array.isArray(doc.search_queries)) {
  for (const q of doc.search_queries) {
    q.enabled = false;
  }
  // Ajouter les requêtes françaises en tête
  doc.search_queries = [...frenchSearchQueries, ...doc.search_queries];
}

// Désactiver toutes les anciennes entreprises US
if (Array.isArray(doc.tracked_companies)) {
  for (const c of doc.tracked_companies) {
    c.enabled = false;
  }
  // Ajouter les entreprises françaises actives en tête
  doc.tracked_companies = [...frenchCompanies, ...doc.tracked_companies];
}

// Réécrire portals.yml
const newYaml = yaml.dump(doc, { lineWidth: -1, noRefs: true });
fs.writeFileSync(filePath, newYaml, 'utf8');
console.log('portals.yml updated successfully!');
console.log('Active French companies:', frenchCompanies.length);
console.log('Active French search queries:', frenchSearchQueries.length);
