import fs from 'node:fs';
import * as yaml from 'js-yaml';

const filePath = 'portals.yml';
const doc = yaml.load(fs.readFileSync(filePath, 'utf8'));

// 1. Définition des 13 entreprises EXACTES de l'utilisateur avec leurs URLs 200 OK vérifiées en direct
const my13Employers = [
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
  },
  {
    name: "Doctolib (Télétravail France)",
    careers_url: "https://job-boards.greenhouse.io/doctolib",
    provider: "greenhouse",
    enabled: true,
    notes: "E-santé, postes en télétravail / remote France."
  },
  {
    name: "Alan (Télétravail France)",
    careers_url: "https://jobs.ashbyhq.com/alan",
    provider: "ashby",
    enabled: true,
    notes: "Assurance santé, culture 100% remote / télétravail."
  },
  {
    name: "Pennylane (Télétravail France)",
    careers_url: "https://jobs.ashbyhq.com/pennylane",
    provider: "ashby",
    enabled: true,
    notes: "SaaS comptabilité & gestion. Postes full remote France."
  },
  {
    name: "Qonto (Télétravail France)",
    careers_url: "https://jobs.ashbyhq.com/qonto",
    provider: "ashby",
    enabled: true,
    notes: "Fintech B2B France. Postes web et support IT à distance."
  },
  {
    name: "Swile (Télétravail France)",
    careers_url: "https://jobs.lever.co/swile",
    provider: "lever",
    enabled: true,
    notes: "Avantages salariés & tech. Postes développeur et support à distance."
  }
];

// Suppression TOTALE de tous les éléments en pause
doc.tracked_companies = my13Employers;

// Nettoyer job_boards s'il y a des boards étrangers désactivés
doc.job_boards = [];

// Écrire le nouveau portals.yml nettoyé
const newYaml = yaml.dump(doc, { lineWidth: -1, noRefs: true });
fs.writeFileSync(filePath, newYaml, 'utf8');

console.log('CLEANUP COMPLETE:');
console.log('Tracked companies count:', doc.tracked_companies.length);
console.log('Paused companies count: 0 (completely removed)');
