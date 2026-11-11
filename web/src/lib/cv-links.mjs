// Liens personnels (LinkedIn, GitHub, portfolio…) insérés automatiquement dans
// l'en-tête des CV Markdown. Pur, sans dépendance, chargeable par `node --test`.
//
// Format d'en-tête attendu (celui de cv.md) :
//   # CV -- Prénom Nom
//
//   **Location:** Béthune, France
//   **Email:** …
//   **LinkedIn:** linkedin.com/in/…
//
// Chaque lien devient une ligne « **Libellé:** url ». Une ligne existante de même
// libellé est mise à jour ; un lien retiré voit sa ligne supprimée.

/** Types reconnus : libellé affiché dans le CV + motif d'URL pour la détection. */
export const LINK_KINDS = [
  { kind: "linkedin", label: "LinkedIn", re: /(^|\.)linkedin\.com$/i },
  { kind: "github", label: "GitHub", re: /(^|\.)github\.(com|io)$/i },
  { kind: "gitlab", label: "GitLab", re: /(^|\.)gitlab\.com$/i },
  { kind: "malt", label: "Malt", re: /(^|\.)malt\.(fr|com)$/i },
  { kind: "behance", label: "Behance", re: /(^|\.)behance\.net$/i },
  { kind: "dribbble", label: "Dribbble", re: /(^|\.)dribbble\.com$/i },
  { kind: "stackoverflow", label: "Stack Overflow", re: /(^|\.)stackoverflow\.com$/i },
  { kind: "youtube", label: "YouTube", re: /(^|\.)youtube\.com$/i },
  { kind: "x", label: "X", re: /(^|\.)(x|twitter)\.com$/i },
];

/** Normalise une URL saisie : ajoute https:// si besoin, refuse ce qui n'est pas http(s). */
export function normalizeUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

/** Détecte le type de lien à partir de l'URL (« site » par défaut). */
export function detectKind(raw) {
  const u = normalizeUrl(raw);
  if (!u) return { kind: "site", label: "Portfolio" };
  const host = u.hostname.replace(/^www\./, "");
  const hit = LINK_KINDS.find((k) => k.re.test(host));
  return hit ? { kind: hit.kind, label: hit.label } : { kind: "site", label: "Portfolio" };
}

/** Forme courte lisible pour le CV : sans protocole, sans www, sans « / » final. */
export function displayUrl(raw) {
  const u = normalizeUrl(raw);
  if (!u) return "";
  return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`;
}

/**
 * Nettoie une liste de liens saisis : URL valide, libellé non vide, sans doublon.
 * @param {Array<{label?: string, url?: string}>} links
 * @returns {Array<{label: string, url: string, kind: string}>}
 */
export function cleanLinks(links) {
  const out = [];
  const seen = new Set();
  for (const l of Array.isArray(links) ? links : []) {
    const u = normalizeUrl(l?.url);
    if (!u) continue;
    const detected = detectKind(u.href);
    const label = String(l?.label || "").trim().replace(/[*:\n]/g, "").slice(0, 40) || detected.label;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label, url: u.href, kind: detected.kind });
  }
  return out.slice(0, 12);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const contactLineRe = /^\*\*[^*\n]{1,40}:\*\*/;

/**
 * Applique les liens à l'en-tête d'un CV.
 * @param {string} md - CV Markdown
 * @param {Array<{label: string, url: string}>} links - liens à afficher
 * @param {string[]} [removedLabels] - libellés à retirer (liens supprimés)
 * @returns {string}
 */
export function applyLinksToCv(md, links, removedLabels = []) {
  let lines = String(md || "").replace(/\r\n/g, "\n").split("\n");

  // Lignes retirées : seulement dans l'en-tête (avant la première section « ## »).
  const firstSection = () => {
    const i = lines.findIndex((l) => /^##\s/.test(l));
    return i < 0 ? lines.length : i;
  };
  for (const label of removedLabels) {
    const re = new RegExp(`^\\*\\*${escapeRe(label)}\\s*:\\*\\*`, "i");
    const end = firstSection();
    lines = lines.filter((l, i) => !(i < end && re.test(l)));
  }

  for (const link of links) {
    const value = displayUrl(link.url);
    if (!value) continue;
    const line = `**${link.label}:** ${value}`;
    const re = new RegExp(`^\\*\\*${escapeRe(link.label)}\\s*:\\*\\*`, "i");
    const end = firstSection();
    const existing = lines.findIndex((l, i) => i < end && re.test(l));
    if (existing >= 0) {
      lines[existing] = line;
      continue;
    }
    // Insertion après la dernière ligne de contact de l'en-tête…
    let lastContact = -1;
    for (let i = 0; i < end; i++) if (contactLineRe.test(lines[i])) lastContact = i;
    if (lastContact >= 0) {
      lines.splice(lastContact + 1, 0, line);
      continue;
    }
    // … sinon juste sous le titre « # », séparée par une ligne vide.
    const title = lines.findIndex((l) => /^#\s/.test(l));
    if (title >= 0) lines.splice(title + 1, 0, "", line);
    else lines.unshift(line, "");
  }
  return lines.join("\n");
}
