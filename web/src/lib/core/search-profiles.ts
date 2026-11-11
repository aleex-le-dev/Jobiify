import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as yaml from "js-yaml";
import { profileTargetKeywords } from "@/lib/profile-keywords.mjs";
import { careerOpsRoot } from "@/lib/career-ops";
import { atomicWrite, atomicWriteWithBackup } from "./safe-write";
import { expandTitles } from "@/lib/job-synonyms.mjs";
import { applyLinksToCv, cleanLinks, displayUrl } from "@/lib/cv-links.mjs";
import { DEFAULT_FILTERS, SEARCH_SOURCES, cleanChips, type AtsSource, type ExploreFilters } from "@/lib/explore";
import type { CvSummary, SearchProfile } from "@/lib/search-profile-types";

/**
 * Profils de recherche (couche utilisateur, data/profiles/) : un profil par CV importé.
 * Chaque profil porte SON CV (data/profiles/{id}/cv.md) et SES filtres : postes visés,
 * synonymes générés, exclusions, ville de départ + temps de trajet.
 * Activer un profil recopie son CV dans cv.md (avec sauvegarde .bak), pour que
 * l'évaluation, le PDF et la lettre utilisent le CV de ce profil.
 */

export type { CvSummary, SearchProfile } from "@/lib/search-profile-types";

interface Store {
  active: string | null;
  profiles: SearchProfile[];
}

const dir = () => path.join(careerOpsRoot(), "data", "profiles");
const indexFile = () => path.join(dir(), "index.json");
const cvFile = (id: string) => path.join(dir(), id, "cv.md");
const SAFE_ID = /^[a-z0-9-]{6,64}$/;

function readStore(): Store {
  try {
    const raw = JSON.parse(fs.readFileSync(indexFile(), "utf8")) as Partial<Store>;
    return {
      active: typeof raw.active === "string" ? raw.active : null,
      profiles: Array.isArray(raw.profiles) ? raw.profiles.filter((p) => p && SAFE_ID.test(p.id)) : [],
    };
  } catch {
    return { active: null, profiles: [] };
  }
}

function writeStore(store: Store): void {
  fs.mkdirSync(dir(), { recursive: true });
  atomicWrite(indexFile(), `${JSON.stringify(store, null, 2)}\n`);
}

/**
 * Migration douce : une installation qui a déjà un cv.md mais aucun profil reçoit
 * un « Profil principal » (ce CV + les postes visés de config/profile.yml).
 * Ne fait rien dès qu'un index de profils existe, même vide (suppression volontaire).
 */
export function ensureDefaultProfile(): void {
  if (fs.existsSync(indexFile())) return;
  let cv = "";
  try {
    cv = fs.readFileSync(path.join(careerOpsRoot(), "cv.md"), "utf8");
  } catch {
    return;
  }
  if (!cv.trim()) return;
  let titles: string[] = [];
  try {
    titles = cleanChips(profileTargetKeywords(yaml.load(fs.readFileSync(path.join(careerOpsRoot(), "config", "profile.yml"), "utf8")) as Record<string, unknown>));
  } catch {
    /* profil sans postes : l'utilisateur les saisira */
  }
  createProfile({ name: "Profil principal", titles, cvMarkdown: cv }, { activate: true });
}

/** Résumé lisible du CV d'un profil, pour l'afficher sur sa carte. */
export function cvSummary(id: string): CvSummary {
  const cv = readProfileCv(id);
  if (!cv.trim()) return { hasCv: false, person: "", headline: "", location: "", experiences: 0, words: 0 };
  const person = (cv.match(/^#\s*(?:CV\s*[-—–]+\s*)?(.+)$/m)?.[1] || "").trim();
  const location = (cv.match(/^\*\*(?:Location|Localisation|Ville)\s*:\*\*\s*(.+)$/im)?.[1] || "").trim();
  // Premier intitulé en gras sous une expérience = poste le plus récent.
  const headline = (cv.match(/^###[^\n]*\n+\*\*([^*\n]+)\*\*/m)?.[1] || "").trim();
  return {
    hasCv: true,
    person,
    headline,
    location,
    experiences: (cv.match(/^###\s/gm) || []).length,
    words: cv.split(/\s+/).filter(Boolean).length,
  };
}

export function listProfiles(): { active: string | null; profiles: SearchProfile[]; summaries: Record<string, CvSummary> } {
  ensureDefaultProfile();
  const store = readStore();
  return { ...store, summaries: Object.fromEntries(store.profiles.map((p) => [p.id, cvSummary(p.id)])) };
}

export function getProfile(id: string): SearchProfile | null {
  return readStore().profiles.find((p) => p.id === id) || null;
}

export function getActiveProfile(): SearchProfile | null {
  ensureDefaultProfile();
  const s = readStore();
  return s.profiles.find((p) => p.id === s.active) || null;
}

export function readProfileCv(id: string): string {
  if (!SAFE_ID.test(id)) return "";
  try {
    return fs.readFileSync(cvFile(id), "utf8");
  } catch {
    return "";
  }
}

// Sources qu'un profil peut interroger ; par défaut, uniquement les sources régionales.
const ALL_SOURCES: AtsSource[] = [...SEARCH_SOURCES];
const DEFAULT_SOURCES: AtsSource[] = ["portals"];
/** Garde seulement les sources encore proposées (retire Greenhouse / Lever / Ashby). */
const allowedSources = (list: readonly string[] | undefined): AtsSource[] => {
  const kept = (list ?? []).filter((s): s is AtsSource => (ALL_SOURCES as string[]).includes(s));
  return kept.length ? kept : [...DEFAULT_SOURCES];
};

function sanitize(input: Partial<SearchProfile>, base?: SearchProfile): SearchProfile {
  const titles = cleanChips(input.titles ?? base?.titles ?? []);
  const minutes = Number(input.commuteMinutes ?? base?.commuteMinutes ?? 30);
  const since = Number(input.sinceDays ?? base?.sinceDays ?? 14);
  const sources = allowedSources(cleanChips(input.sources ?? base?.sources ?? DEFAULT_SOURCES));
  // « Lières (62190) » (ancien format) → nom « Lières » + code postal « 62190 ».
  let originCity = String(input.originCity ?? base?.originCity ?? "Lières").trim().slice(0, 80) || "Lières";
  let originPostalCode = String(input.originPostalCode ?? base?.originPostalCode ?? "").trim();
  const inParens = originCity.match(/^(.*?)\s*\((\d{5})\)\s*$/);
  if (inParens) {
    originCity = inParens[1].trim() || "Lières";
    originPostalCode ||= inParens[2];
  }
  if (!/^\d{5}$/.test(originPostalCode)) originPostalCode = "";
  // Une ville saisie sans choix dans la liste ne garde pas l'INSEE d'une autre commune.
  const cityChanged = input.originCity !== undefined && base && input.originInsee === undefined && originCity !== base.originCity;
  const rawInsee = String(input.originInsee ?? (cityChanged ? "" : base?.originInsee ?? "")).trim();
  const originInsee = /^(\d{5}|2[AB]\d{3})$/.test(rawInsee) ? rawInsee : "";
  return {
    id: base?.id || randomUUID(),
    name: String(input.name ?? base?.name ?? (titles[0] || "Nouveau profil")).trim().slice(0, 80) || "Profil",
    titles,
    synonyms: cleanChips(input.synonyms ?? base?.synonyms ?? expandTitles(titles)),
    negative: cleanChips(input.negative ?? base?.negative ?? ["stage", "stagiaire", "alternance", "apprenti"]),
    originCity,
    ...(originPostalCode ? { originPostalCode } : {}),
    ...(originInsee ? { originInsee } : {}),
    commuteMinutes: Number.isFinite(minutes) ? Math.min(120, Math.max(5, Math.round(minutes))) : 30,
    remoteOnly: Boolean(input.remoteOnly ?? base?.remoteOnly ?? false),
    sinceDays: Number.isFinite(since) ? Math.min(90, Math.max(0, Math.round(since))) : 14,
    sources,
    createdAt: base?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Recopie le CV du profil dans cv.md (sauvegarde .bak de l'ancien). */
function syncRootCv(id: string): void {
  const cv = readProfileCv(id);
  if (!cv.trim()) return;
  const root = path.join(careerOpsRoot(), "cv.md");
  let current = "";
  try {
    current = fs.readFileSync(root, "utf8");
  } catch {
    /* pas encore de cv.md */
  }
  // Pas de réécriture (ni de .bak) quand le CV est déjà celui du profil.
  if (current !== cv) atomicWriteWithBackup(root, cv);
}

export function createProfile(input: Partial<SearchProfile> & { cvMarkdown?: string }, { activate = true } = {}): SearchProfile {
  const store = readStore();
  // Postes créés automatiquement depuis le CV si l'import n'en a pas proposé.
  const auto = !cleanChips(input.titles).length && input.cvMarkdown ? titlesFromCv(input.cvMarkdown) : [];
  const profile = sanitize(auto.length ? { ...input, titles: auto, name: input.name || auto[0] } : input);
  if (input.cvMarkdown?.trim()) {
    fs.mkdirSync(path.dirname(cvFile(profile.id)), { recursive: true });
    // Les liens personnels (LinkedIn, GitHub…) sont ajoutés automatiquement au CV importé.
    const links = readLinks();
    atomicWrite(cvFile(profile.id), links.length ? applyLinksToCv(input.cvMarkdown, links) : input.cvMarkdown);
  }
  store.profiles.push(profile);
  if (activate || !store.active) store.active = profile.id;
  writeStore(store);
  if (store.active === profile.id) syncRootCv(profile.id);
  return profile;
}

export function updateProfile(id: string, patch: Partial<SearchProfile> & { regenerateSynonyms?: boolean }): SearchProfile | null {
  const store = readStore();
  const i = store.profiles.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const next = sanitize(
    patch.regenerateSynonyms ? { ...patch, synonyms: expandTitles(cleanChips(patch.titles ?? store.profiles[i].titles)) } : patch,
    store.profiles[i],
  );
  store.profiles[i] = next;
  writeStore(store);
  return next;
}

/** Enregistre le CV d'un profil (appelé quand on modifie cv.md avec ce profil actif). */
export function saveProfileCv(id: string, markdown: string): void {
  if (!SAFE_ID.test(id) || !getProfile(id)) return;
  fs.mkdirSync(path.dirname(cvFile(id)), { recursive: true });
  atomicWrite(cvFile(id), markdown);
  // Profil actif : cv.md (utilisé par l'évaluation et les candidatures) suit.
  if (readStore().active === id) syncRootCv(id);
}

/**
 * Postes déduits du CV quand l'import n'en fournit pas (fichier .md/.txt sans
 * outil IA) : intitulés en gras sous chaque expérience + titre du profil.
 */
export function titlesFromCv(md: string): string[] {
  const out: string[] = [];
  for (const m of md.matchAll(/^###[^\n]*\n+\*\*([^*\n]{3,80})\*\*/gm)) {
    // "Développeur Fullstack & Support Technique" → deux postes distincts.
    for (const part of m[1].split(/\s*(?:&|\/|,| et )\s*/)) {
      const t = part.replace(/\s*\((?:h\/f|f\/h)\)\s*/i, "").trim();
      if (t.length >= 3 && !/ind[ée]pendant|projets?|personnel/i.test(t)) out.push(t);
    }
  }
  return cleanChips(out).slice(0, 6);
}

export function activateProfile(id: string): SearchProfile | null {
  const store = readStore();
  const p = store.profiles.find((x) => x.id === id);
  if (!p) return null;
  store.active = id;
  writeStore(store);
  syncRootCv(id);
  return p;
}

export function deleteProfile(id: string): boolean {
  const store = readStore();
  const before = store.profiles.length;
  store.profiles = store.profiles.filter((p) => p.id !== id);
  if (store.profiles.length === before) return false;
  if (store.active === id) store.active = store.profiles[0]?.id || null;
  writeStore(store);
  try {
    fs.rmSync(path.join(dir(), id), { recursive: true, force: true });
  } catch {
    /* CV orphelin : sans gravité */
  }
  if (store.active) syncRootCv(store.active);
  return true;
}

/**
 * Filtres de l'Explorer dérivés d'un profil : postes + synonymes en mots-clés
 * positifs, toutes les sources, zone de trajet du profil. Les listes de lieux
 * de portals.yml (block / block_hard) sont conservées par l'appelant.
 */
export function filtersFromProfile(p: SearchProfile, base: ExploreFilters = DEFAULT_FILTERS): ExploreFilters {
  return {
    ...base,
    positive: cleanChips([...p.titles, ...p.synonyms]),
    negative: cleanChips(p.negative),
    allow: [],
    alwaysAllow: [],
    originCity: p.originCity,
    originInsee: p.originInsee,
    commuteMinutes: p.commuteMinutes,
    remoteOnly: p.remoteOnly,
    sinceDays: p.sinceDays,
    ats: allowedSources(p.sources),
  };
}

// ── Liens personnels (LinkedIn, GitHub, portfolio…) partagés par tous les CV ──

export type CvLink = { label: string; url: string; kind: string };

const linksFile = () => path.join(dir(), "links.json");

export function readLinks(): CvLink[] {
  try {
    const raw = JSON.parse(fs.readFileSync(linksFile(), "utf8")) as { links?: unknown };
    return cleanLinks(Array.isArray(raw.links) ? raw.links : []);
  } catch {
    return [];
  }
}

/**
 * Met à jour config/profile.yml (candidate.linkedin / candidate.github) par
 * remplacement ciblé de la ligne existante : les commentaires du fichier sont
 * préservés et aucune clé n'est créée.
 */
function syncProfileYaml(links: CvLink[]): void {
  const file = path.join(careerOpsRoot(), "config", "profile.yml");
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  let next = text;
  for (const key of ["linkedin", "github"] as const) {
    const link = links.find((l) => l.kind === key);
    if (!link) continue;
    const value = displayUrl(link.url).replace(/"/g, "");
    next = next.replace(new RegExp(`^(\s+${key}:\s*).*$`, "m"), `$1"${value}"`);
  }
  if (next !== text) atomicWriteWithBackup(file, next);
}

/**
 * Enregistre les liens et les applique à TOUS les CV : chaque profil, puis
 * cv.md (profil actif) et config/profile.yml. Renvoie le nombre de CV modifiés.
 */
export function saveLinks(input: Array<{ label?: string; url?: string }>): { links: CvLink[]; updatedCvs: number } {
  const links = cleanLinks(input);
  const previous = readLinks();
  const keep = new Set(links.map((l) => l.label.toLowerCase()));
  const removed = previous.map((l) => l.label).filter((label) => !keep.has(label.toLowerCase()));

  fs.mkdirSync(dir(), { recursive: true });
  atomicWrite(linksFile(), `${JSON.stringify({ links }, null, 2)}\n`);

  let updatedCvs = 0;
  const store = readStore();
  for (const p of store.profiles) {
    const cv = readProfileCv(p.id);
    if (!cv.trim()) continue;
    const next = applyLinksToCv(cv, links, removed);
    if (next !== cv) {
      atomicWrite(cvFile(p.id), next);
      updatedCvs++;
    }
  }
  if (store.active) {
    syncRootCv(store.active);
  } else {
    // Aucun profil : on met quand même à jour cv.md directement.
    const root = path.join(careerOpsRoot(), "cv.md");
    try {
      const cv = fs.readFileSync(root, "utf8");
      const next = applyLinksToCv(cv, links, removed);
      if (next !== cv) {
        atomicWriteWithBackup(root, next);
        updatedCvs++;
      }
    } catch {
      /* pas de cv.md */
    }
  }
  syncProfileYaml(links);
  return { links, updatedCvs };
}
