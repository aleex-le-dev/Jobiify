// Correspondance entre un intitulé d'offre et les mots-clés d'un profil — pur,
// sans dépendance, chargeable par `node --test`. Une seule règle pour TOUTES les
// sources (France Travail, Meteojob, portails, intérim…), pour qu'une offre ne
// soit pas gardée par une source et perdue par une autre.
//
// Les offres sont publiées sous des formes très variables : « TECHNICIEN
// INFORMATIQUE H/F » (sans accent, en majuscules), « Technicien(ne) support »,
// « Technicien·ne de maintenance informatique ». La comparaison se fait donc
// sans accents, sans écriture inclusive, et au mot près plutôt qu'à la lettre.

const STOPWORDS = new Set(["de", "du", "des", "d", "la", "le", "les", "l", "en", "et", "a", "au", "aux", "pour", "sur", "ou"]);
const GENDER_TOKENS = new Set(["h", "f", "m", "x", "d", "hf", "fh"]);

/** Minuscules, sans accents ni écriture inclusive, ponctuation remplacée par des espaces. */
export function foldText(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    // « technicien(ne) », « conducteur(trice) », « employé(e)s »
    .replace(/\((?:ne|nne|e|es|euse|trice|rice|ere|se|te|s)\)/g, "")
    // « technicien·ne », « technicien.ne », « employé-e »
    .replace(/[·•.](?:ne|nne|e|es|euse|trice|rice|ere|se|te)\b/g, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

const words = (folded) => folded.split(" ").filter(Boolean);

/** Un mot du titre correspond-il à un mot du mot-clé (pluriel et féminin tolérés) ? */
function wordMatches(titleWord, kwWord) {
  if (titleWord === kwWord) return true;
  // « technicien » ↔ « technicienne », « techniciens » ; « cariste » ↔ « caristes ».
  if (kwWord.length >= 4 && titleWord.startsWith(kwWord) && titleWord.length - kwWord.length <= 3) return true;
  // Mot-clé au pluriel, titre au singulier : « réseaux » ↔ « réseau ».
  if (kwWord.length >= 5 && kwWord.startsWith(titleWord) && titleWord.length >= 4 && kwWord.length - titleWord.length <= 2) return true;
  return false;
}

/**
 * Le texte contient-il le mot-clé ?
 *  - mot-clé court (≤ 3 lettres : « ide », « ash », « it ») : mot entier uniquement ;
 *  - sinon l'expression telle quelle, ou tous ses mots significatifs présents dans
 *    le titre, dans n'importe quel ordre (« technicien informatique » reconnaît
 *    « Technicien de maintenance informatique »).
 * @param {string} text
 * @param {string} keyword
 * @returns {boolean}
 */
export function matchesKeyword(text, keyword) {
  const k = foldText(keyword);
  if (!k) return false;
  const t = foldText(text);
  if (!t) return false;
  if (k.length <= 3) return ` ${t} `.includes(` ${k} `);
  if (t.includes(k)) return true;
  const kw = words(k).filter((w) => !STOPWORDS.has(w));
  if (kw.length < 2) return false;
  const tw = words(t).filter((w) => !GENDER_TOKENS.has(w));
  return kw.every((k1) => (k1.length <= 3 ? tw.includes(k1) : tw.some((w) => wordMatches(w, k1))));
}

/** Premier mot-clé de la liste reconnu dans le texte (ou undefined). */
export function firstMatch(text, keywords) {
  if (!Array.isArray(keywords)) return undefined;
  for (const k of keywords) if (k && matchesKeyword(text, k)) return k;
  return undefined;
}

/**
 * Filtre de titre d'un profil : aucun mot exclu, et au moins un poste visé
 * (ou aucun poste défini = tout passe).
 * @param {string} title
 * @param {{positive?: string[], negative?: string[]}} filters
 */
export function titlePasses(title, filters) {
  const negative = filters?.negative || [];
  // Les mots exclus restent stricts (expression exacte) : « stage » n'écarte pas
  // une offre parce que ses mots apparaissent séparément dans le titre.
  const t = foldText(title);
  for (const n of negative) {
    const k = foldText(n);
    if (!k) continue;
    if (k.length <= 3 ? ` ${t} `.includes(` ${k} `) : t.includes(k)) return false;
  }
  const positive = filters?.positive || [];
  if (positive.length === 0) return true;
  return positive.some((p) => p && matchesKeyword(title, p));
}

/** Le lieu est-il dans une liste de lieux refusés ? (« Calais » ≠ « Pas-de-Calais ») */
export function isBlockedLocation(location, blockList) {
  if (!Array.isArray(blockList) || blockList.length === 0) return false;
  const loc = foldText(location).replace(/\bpas de calais\b/g, " ").replace(/\s+/g, " ").trim();
  if (!loc) return false;
  return blockList.some((b) => {
    const k = foldText(b);
    return k ? ` ${loc} `.includes(` ${k} `) : false;
  });
}

const REMOTE_RE = /teletravail|full remote|100 remote|\bremote\b|a distance/;
/** L'offre mentionne-t-elle du télétravail (titre ou lieu) ? */
export function looksRemote(...texts) {
  return REMOTE_RE.test(foldText(texts.filter(Boolean).join(" ")));
}

const GENERIC_COMPANY = /^(entreprise|societe|employeur|confidentiel|non communique|agence|france travail|pme)/;

/**
 * Clé de dédoublonnage entre sources : la même offre publiée sur France Travail,
 * Meteojob et le site de l'agence ne doit apparaître qu'une fois. Renvoie ""
 * quand l'employeur est inconnu ou générique (on ne fusionne pas à l'aveugle).
 * @param {{title?: string, company?: string, location?: string}} offer
 */
export function dedupeKey(offer) {
  const company = foldText(offer?.company);
  if (!company || GENERIC_COMPANY.test(company)) return "";
  const title = words(foldText(offer?.title)).filter((w) => !GENDER_TOKENS.has(w)).join(" ");
  if (!title) return "";
  // Ville seule : « Béthune (62) », « 62 - Béthune », « Béthune, France » → « bethune ».
  const city = words(foldText(String(offer?.location ?? "").split(/[,(—|]/)[0]))
    .filter((w) => !/^\d+$/.test(w))
    .join(" ");
  return `${title}|${company}|${city}`;
}
