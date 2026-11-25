// Classement des offres par l'utilisateur (« Déjà postulé », « Pas intéressé ») —
// pur, sans dépendance, chargeable par `node --test`.
//
// Une même offre arrive souvent par plusieurs sources avec des URL différentes :
// chaque offre est donc reconnue par son URL ET par une clé « poste | entreprise |
// ville ». Classer l'une la classe partout, y compris à la prochaine recherche.

import { companyKey, dedupeKey } from "./offer-match.mjs";

export const MARKS = /** @type {const} */ (["applied", "dismissed"]);
export const MARK_LABEL = { applied: "Déjà postulé", dismissed: "Pas intéressé" };
const MAX_ENTRIES = 6000;

/** @typedef {"applied"|"dismissed"} Mark */
/** @typedef {Record<string, {mark: Mark, at: string, k?: string}>} MarkStore */

/** Identifiants d'une offre : `u:` + URL, et `k:` + clé poste/entreprise/ville quand elle existe. */
export function offerIds(offer) {
  const ids = [];
  const url = String(offer?.url ?? "").trim();
  if (url) ids.push(`u:${url}`);
  const key = dedupeKey(offer ?? {});
  if (key) ids.push(`k:${key}`);
  return ids;
}

/** Magasin lu depuis le disque : tout ce qui n'est pas un classement valide est ignoré. */
export function normalizeMarks(raw) {
  /** @type {MarkStore} */
  const out = {};
  const source = raw && typeof raw === "object" && raw.marks && typeof raw.marks === "object" ? raw.marks : {};
  for (const [id, v] of Object.entries(source)) {
    if (!/^[ukc]:/.test(id) || !v || !MARKS.includes(v.mark)) continue;
    out[id] = { mark: v.mark, at: typeof v.at === "string" ? v.at : "", ...(typeof v.k === "string" && v.k ? { k: v.k } : {}) };
  }
  return out;
}

/**
 * Nouveau magasin après classement d'offres (`mark` null = retour dans les nouvelles).
 * @param {MarkStore} store
 * @param {Array<{url?: string, title?: string, company?: string, location?: string}>} offers
 * @param {Mark|null} mark
 * @param {string} [now]
 * @returns {MarkStore}
 */
export function applyMark(store, offers, mark, now = new Date().toISOString()) {
  const next = { ...store };
  for (const offer of offers) {
    const key = dedupeKey(offer ?? {});
    for (const id of offerIds(offer)) {
      if (mark) next[id] = { mark, at: now, ...(key ? { k: key } : {}) };
      else delete next[id];
    }
    // Remise dans les nouvelles : les copies de la même offre vues sur d'autres sources aussi.
    const company = companyKey(offer?.company);
    if (!mark && company) delete next[`c:${company}`];
    if (!mark && key) for (const id of Object.keys(next)) if (next[id].k === key) delete next[id];
  }
  // Magasin borné : les classements les plus anciens partent en premier.
  const ids = Object.keys(next);
  if (ids.length > MAX_ENTRIES) {
    ids.sort((a, b) => (next[a].at || "").localeCompare(next[b].at || ""));
    for (const id of ids.slice(0, ids.length - MAX_ENTRIES)) delete next[id];
  }
  return next;
}

/**
 * Masque toutes les offres d'une entreprise, y compris celles que les prochaines
 * recherches ramèneront. Sans effet quand l'employeur est inconnu.
 * @param {MarkStore} store
 * @param {string} company
 * @param {string} [now]
 * @returns {MarkStore}
 */
export function muteCompany(store, company, now = new Date().toISOString()) {
  const key = companyKey(company);
  return key ? { ...store, [`c:${key}`]: { mark: "dismissed", at: now } } : store;
}

/** Classement d'une offre (undefined = nouvelle). Une entreprise masquée classe toutes ses offres. */
export function markOf(store, offer) {
  if (!store) return undefined;
  for (const id of offerIds(offer)) if (store[id]) return store[id].mark;
  const company = companyKey(offer?.company);
  return company && store[`c:${company}`] ? store[`c:${company}`].mark : undefined;
}
