// Suggestions après « Pas intéressé » — pur, sans dépendance, sans IA : on compte,
// on ne devine pas. Rien n'est appliqué sans un clic de l'utilisateur.

import { companyKey, foldText } from "./offer-match.mjs";

// Mots qui décrivent un type de poste ou un contrat, pas un métier : jamais proposés à l'exclusion.
const COMMON = new Set(
  ("technicien technicienne agent agente operateur operatrice assistant assistante responsable conseiller conseillere charge chargee " +
    "ingenieur chef equipe adjoint adjointe gestionnaire employe employee polyvalent polyvalente cdi cdd interim emploi poste mission " +
    "niveau junior senior confirme debutant secteur france region entreprise societe groupe agence service services recrute recherche " +
    "temps plein partiel travail alternance stage h/f").split(" "),
);

const words = (text) => foldText(text).split(" ").filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !COMMON.has(w));

/**
 * Mot du titre qui revient dans les offres écartées et qui n'appartient ni au profil
 * ni aux exclusions déjà en place : bon candidat à une exclusion.
 *
 * @param {{title?: string}} current  L'offre qui vient d'être écartée
 * @param {Array<{title?: string}>} dismissed  Toutes les offres écartées de la session (celle-ci comprise)
 * @param {string[]} profileTerms  Postes et synonymes du profil
 * @param {string[]} existingNegative  Mots déjà exclus
 * @returns {{word: string, count: number} | null}
 */
export function suggestExcludedWord(current, dismissed, profileTerms, existingNegative) {
  const own = new Set([...profileTerms, ...existingNegative].flatMap((t) => foldText(t).split(" ")));
  const counts = new Map();
  for (const offer of dismissed) {
    for (const w of new Set(words(offer.title))) if (!own.has(w)) counts.set(w, (counts.get(w) || 0) + 1);
  }
  let best = null;
  for (const w of new Set(words(current.title))) {
    const count = counts.get(w) || 0;
    // Au moins deux offres écartées avec ce mot : un seul refus ne dit rien.
    if (count < 2) continue;
    if (!best || count > best.count || (count === best.count && w.length > best.word.length)) best = { word: w, count };
  }
  return best;
}

/**
 * Entreprise à masquer : seulement si l'employeur est connu et si le geste a un effet
 * visible (d'autres offres de la même entreprise dans les résultats).
 *
 * @param {{company?: string}} current
 * @param {Array<{company?: string, url?: string}>} others  Les autres offres des résultats, non classées
 * @returns {{company: string, others: number} | null}
 */
export function suggestMutedCompany(current, others) {
  const key = companyKey(current.company);
  if (!key) return null;
  const n = others.filter((o) => companyKey(o.company) === key).length;
  return n > 0 ? { company: String(current.company).trim(), others: n } : null;
}
