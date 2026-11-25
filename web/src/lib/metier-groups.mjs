// Regroupement d'offres par métier — pur, sans dépendance, chargeable par `node --test`.
// Sert au panneau « Où sont les offres » : combien d'offres existent, par métier,
// dans la zone du profil, et lesquels sont déjà couverts par ses postes visés.

import { JOB_FAMILIES } from "./job-synonyms.mjs";
import { dedupeKey, foldText, titlePasses } from "./offer-match.mjs";

const GENDER = /\b(h f x|h f|f h x|f h|m f|f m)\b/g;
const NOISE = new Set(["de", "du", "des", "d", "la", "le", "les", "en", "et", "a", "au", "aux", "pour", "sur", "un", "une", "cdi", "cdd", "interim", "junior", "senior", "confirme", "debutant", "temps", "plein", "partiel"]);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Titre sans mention H/F, sans parenthèses ni majuscules criardes. */
export function cleanTitle(title) {
  const t = String(title ?? "").replace(/\(?\b[HFMX]\s*\/\s*[HFMX](?:\s*\/\s*[HFMX])?\b\)?/gi, " ").replace(/\s+/g, " ").replace(/[\s\-–—:,]+$/, "").trim();
  return t === t.toUpperCase() && t.length > 3 ? cap(t.toLowerCase()) : t;
}

// Familles dont le premier intitulé ne dit pas ce qu'elles couvrent : un nom parlant pour l'écran.
const FAMILY_LABEL = {
  peintre: "Second œuvre (peintre, plaquiste, menuisier…)",
  maçon: "Gros œuvre (maçon, coffreur, manœuvre)",
  cariste: "Logistique (cariste, préparateur, magasinier)",
  "agent de production": "Production industrielle",
  "technicien de maintenance": "Maintenance industrielle",
  "assistant administratif": "Administratif et secrétariat",
  "agent d'entretien": "Entretien et propreté",
  "chauffeur poids lourd": "Conduite et livraison",
  animateur: "Animation et petite enfance",
  infirmier: "Infirmier",
  comptable: "Comptabilité et paie",
  "aide-soignant": "Aide-soignant et aide à domicile",
  vendeur: "Vente en magasin",
  commercial: "Commercial",
  "conseiller clientèle": "Relation client et accueil",
  serveur: "Restauration (salle)",
  cuisinier: "Cuisine",
  "agent de sécurité": "Sécurité et surveillance",
};

// Intitulés de chaque famille, préparés une fois (sans accents, mots entiers).
const FAMILIES = JOB_FAMILIES.map((members) => ({
  label: FAMILY_LABEL[members[0]] ?? cap(members[0]),
  key: `f:${foldText(members[0])}`,
  members: [...new Set(members.map(foldText))].filter((m) => m.length >= 3),
}));

/** Famille de métiers la plus précise (intitulé le plus long reconnu) pour un titre déjà « foldé ». */
function familyOf(folded) {
  const padded = ` ${folded} `;
  let best = null;
  for (const f of FAMILIES) {
    for (const m of f.members) {
      if (!padded.includes(` ${m} `)) continue;
      const score = m.length;
      if (!best || score > best.score) best = { family: f, score };
    }
  }
  return best?.family ?? null;
}

/**
 * Métier d'une offre : sa famille connue, sinon ses deux premiers mots significatifs.
 * @param {string} title
 * @returns {{key: string, label: string|null}}  label null = à déduire des titres du groupe
 */
export function metierOf(title) {
  const folded = foldText(title).replace(GENDER, " ").replace(/\s+/g, " ").trim();
  const family = familyOf(folded);
  if (family) return { key: family.key, label: family.label };
  const head = folded.split(" ").filter((w) => w && !NOISE.has(w)).slice(0, 2).join(" ");
  return { key: head ? `t:${head}` : "", label: null };
}

/**
 * Offres qui correspondent aux postes visés du profil : la référence à laquelle comparer les autres métiers.
 * @param {Array<{title: string, company?: string, location?: string, source?: string}>} offers
 * @param {{profileTerms?: string[], negative?: string[]}} [opts]
 * @returns {{count: number, examples: string[]}}
 */
export function matchProfile(offers, { profileTerms = [], negative = [] } = {}) {
  const seen = new Set();
  const titles = new Map();
  let count = 0;
  for (const o of offers) {
    if (!o?.title || !profileTerms.length || !titlePasses(o.title, { positive: profileTerms, negative })) continue;
    const dk = dedupeKey(o);
    if (dk) {
      if (seen.has(dk)) continue;
      seen.add(dk);
    }
    count++;
    const clean = cleanTitle(o.title);
    titles.set(clean, (titles.get(clean) || 0) + 1);
  }
  const examples = [...titles.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length).slice(0, 3).map(([t]) => t);
  return { count, examples };
}

/**
 * @param {Array<{title: string, company?: string, location?: string, source?: string}>} offers
 * @param {{profileTerms?: string[], negative?: string[], minCount?: number, limit?: number}} [opts]
 * @returns {Array<{key: string, label: string, count: number, inProfile: boolean, examples: string[], sources: Record<string, number>}>}
 */
export function groupByMetier(offers, { profileTerms = [], negative = [], minCount = 2, limit = 15 } = {}) {
  const seen = new Set();
  const groups = new Map();
  for (const o of offers) {
    if (!o?.title) continue;
    if (negative.length && !titlePasses(o.title, { negative })) continue;
    // La même offre vue sur plusieurs sources ne compte qu'une fois.
    const dk = dedupeKey(o);
    if (dk) {
      if (seen.has(dk)) continue;
      seen.add(dk);
    }
    const { key, label } = metierOf(o.title);
    if (!key) continue;
    const g = groups.get(key) ?? { key, label, count: 0, covered: 0, titles: new Map(), sources: {} };
    g.count++;
    if (profileTerms.length && titlePasses(o.title, { positive: profileTerms })) g.covered++;
    const clean = cleanTitle(o.title);
    g.titles.set(clean, (g.titles.get(clean) || 0) + 1);
    if (o.source) g.sources[o.source] = (g.sources[o.source] || 0) + 1;
    groups.set(key, g);
  }
  const all = [...groups.values()].map((g) => ({ ...g, inProfile: g.covered > 0 && g.covered / g.count >= 0.5 }));
  return all
    .filter((g) => g.count >= minCount)
    .map((g) => {
      const byFreq = [...g.titles.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
      return {
        key: g.key,
        label: g.label ?? byFreq[0][0],
        count: g.count,
        inProfile: g.inProfile,
        examples: byFreq.slice(0, 3).map(([t]) => t),
        sources: g.sources,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"))
    .slice(0, limit);
}
