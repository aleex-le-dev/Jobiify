// Notes Obsidian générées depuis le suivi de Jobiify — pur, sans dépendance,
// chargeable par `node --test`. Rien ici ne touche au disque.
//
// Principe : Jobiify possède un bloc délimité de chaque note (propriétés YAML
// qu'il gère + texte entre deux marqueurs). Tout le reste (vos notes, vos
// propriétés, vos liens) est conservé tel quel à chaque synchronisation.

export const BLOCK_START = "<!-- jobiify:start -->";
export const BLOCK_END = "<!-- jobiify:end -->";
export const NOTES_HEADING = "## Mes notes";

/** Nom de fichier sûr (Windows et liens Obsidian) : sans / \ : * ? " < > | # ^ [ ]. */
export function safeName(s, max = 80) {
  const clean = String(s ?? "")
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  const name = clean.slice(0, max).trim() || "Sans nom";
  // Windows réserve ces noms (avec ou sans extension) : « CON.md » désigne un périphérique, pas un fichier.
  return /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i.test(name) ? `${name} (note)` : name;
}

/** Lien Obsidian vers une note (le titre affiché est facultatif). */
export const wikilink = (path, label) => `[[${path}${label ? `|${String(label).replace(/[\]|]/g, " ")}` : ""}]]`;

function yamlScalar(v) {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v ?? "");
  if (s === "") return '""';
  // Guillemets dès qu'une valeur pourrait être lue autrement qu'en texte.
  if (/^[\s>|*&!%@`'"#\-?:,[\]{}]|[:#]\s|\s$|^(true|false|null|yes|no|~|\d[\d.:\-/]*)$/i.test(s)) return JSON.stringify(s);
  return s;
}

/** Lignes YAML d'un objet : listes en `- item`, valeurs vides omises. */
export function yamlLines(obj) {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      out.push(`${k}:`, ...v.map((x) => `  - ${yamlScalar(x)}`));
    } else out.push(`${k}: ${yamlScalar(v)}`);
  }
  return out;
}

/** Sépare le YAML d'en-tête d'une note du reste. */
function splitFrontmatter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? { yaml: m[1], rest: text.slice(m[0].length) } : { yaml: "", rest: String(text) };
}

/** Propriétés de l'utilisateur : tout ce que Jobiify ne gère pas, valeurs multilignes comprises. */
function foreignYamlLines(yamlText, managed) {
  const keep = [];
  let keeping = false;
  for (const line of yamlText.split(/\r?\n/)) {
    const key = line.match(/^([^\s#:][^:]*):/)?.[1]?.trim();
    if (key !== undefined) keeping = !managed.has(key);
    if (keeping && line.trim() !== "") keep.push(line);
  }
  return keep;
}

/**
 * Note finale : propriétés gérées + bloc Jobiify, avec le contenu existant conservé.
 * @param {string|null} existing  Texte actuel de la note (null = nouvelle note)
 * @param {Record<string, unknown>} props  Propriétés gérées par Jobiify
 * @param {string} block  Corps du bloc Jobiify
 */
export function mergeNote(existing, props, block) {
  const managed = new Set(Object.keys(props));
  const section = `${BLOCK_START}\n${block.trim()}\n${BLOCK_END}`;
  if (existing == null || existing.trim() === "") {
    return `---\n${yamlLines(props).join("\n")}\n---\n\n${section}\n\n${NOTES_HEADING}\n\n`;
  }
  const { yaml, rest } = splitFrontmatter(existing);
  const head = [...yamlLines(props), ...foreignYamlLines(yaml, managed)];
  const s = rest.indexOf(BLOCK_START);
  const e = rest.indexOf(BLOCK_END);
  let body;
  if (s >= 0 && e > s) body = rest.slice(0, s) + section + rest.slice(e + BLOCK_END.length);
  // Marqueurs supprimés ou abîmés : le bloc est ajouté, rien n'est écrasé.
  else body = `${rest.replace(/\s+$/, "")}\n\n${section}\n`;
  return `---\n${head.join("\n")}\n---\n${body.startsWith("\n") ? "" : "\n"}${body}`;
}

const STATUS_TAG = (status) =>
  `statut/${safeName(status || "inconnu", 30).toLowerCase().replace(/\s+/g, "-")}`;

/** Nombre d'une note « 4.2/5 » (null si absent). */
export function scoreNumber(score) {
  const m = String(score ?? "").match(/(\d+(?:[.,]\d+)?)\s*\/\s*5/);
  return m ? Number(m[1].replace(",", ".")) : null;
}

const hrefOf = (cell) => String(cell ?? "").match(/\]\((https?:[^)\s]+)\)/)?.[1] || String(cell ?? "").match(/https?:\/\/\S+/)?.[0] || "";

/** Nom de fichier d'une candidature : « 007 - Entreprise - Poste ». */
export const applicationNoteName = (app) =>
  `${String(app.n).padStart(3, "0")} - ${safeName(app.company, 40)} - ${safeName(app.role, 50)}`;

/**
 * @param {{n:string,date:string,company:string,role:string,location?:string,score?:string,status?:string,url?:string,applyLink?:string,via?:string,notes?:string,pdf?:string}} app
 * @param {string|null} report  Rapport d'évaluation (Markdown), s'il existe
 */
export function applicationNote(app, report) {
  const score = scoreNumber(app.score);
  const url = hrefOf(app.url) || hrefOf(app.applyLink);
  const props = {
    jobiify: "candidature",
    numero: Number(app.n) || undefined,
    entreprise: app.company,
    poste: app.role,
    lieu: app.location,
    note: score ?? undefined,
    statut: app.status,
    date: /^\d{4}-\d{2}-\d{2}/.test(app.date || "") ? app.date.slice(0, 10) : undefined,
    via: app.via && app.via !== "—" ? app.via : undefined,
    lien: url,
    cv_pdf: /✅/.test(app.pdf || "") ? true : undefined,
    tags: ["jobiify", STATUS_TAG(app.status)],
  };
  const lines = [`# ${app.role || "Candidature"}`, "", `Entreprise : ${wikilink(`Entreprises/${safeName(app.company)}`, app.company)}`];
  if (app.location) lines.push(`Lieu : ${app.location}`);
  if (app.score) lines.push(`Note d'évaluation : **${app.score}**`);
  if (url) lines.push(`Annonce : ${url}`);
  if (app.notes) lines.push("", `> ${String(app.notes).replace(/\s*\n\s*/g, " ")}`);
  if (report && report.trim()) lines.push("", "## Rapport d'évaluation", "", report.trim().replace(/^#\s+/m, "### "));
  return { props, block: lines.join("\n") };
}

/**
 * @param {string} company
 * @param {Array<{n:string,role:string,status?:string,score?:string,date?:string}>} apps  Candidatures de cette entreprise
 */
export function companyNote(company, apps) {
  const props = { jobiify: "entreprise", entreprise: company, candidatures: apps.length, tags: ["jobiify", "entreprise"] };
  const lines = [`# ${company}`, "", "## Candidatures", ""];
  for (const a of [...apps].sort((x, y) => Number(y.n) - Number(x.n))) {
    lines.push(`- ${wikilink(`Candidatures/${applicationNoteName({ ...a, company })}`, a.role)}${a.status ? ` — ${a.status}` : ""}${a.score ? ` (${a.score})` : ""}`);
  }
  return { props, block: lines.join("\n") };
}

/** @param {{name:string,titles:string[],synonyms?:string[],negative?:string[],originCity?:string,commuteMinutes?:number,sinceDays?:number,remoteOnly?:boolean}} p */
export function profileNote(p, active) {
  const props = {
    jobiify: "profil",
    profil: p.name,
    actif: active || undefined,
    ville_depart: p.originCity,
    distance_max_km: p.commuteMinutes,
    tags: ["jobiify", "profil"],
  };
  const list = (title, items) => (items?.length ? ["", `## ${title}`, "", ...items.map((i) => `- ${i}`)] : []);
  const lines = [`# ${p.name}`, "", `Zone : ${p.commuteMinutes} km autour de ${p.originCity}${p.remoteOnly ? " · télétravail uniquement" : ""}`, ...list("Postes visés", p.titles), ...list("Mots exclus", p.negative)];
  return { props, block: lines.join("\n") };
}

/** Note d'accueil : chiffres clés et accès aux dossiers. */
export function indexNote({ apps, profiles, pending, generatedAt }) {
  const byStatus = new Map();
  for (const a of apps) byStatus.set(a.status || "—", (byStatus.get(a.status || "—") || 0) + 1);
  const props = { jobiify: "accueil", candidatures: apps.length, mis_a_jour: generatedAt, tags: ["jobiify"] };
  const lines = ["# Jobiify", "", "Notes générées par Jobiify : tout ce qui est écrit **hors** des blocs délimités (sous « Mes notes ») est conservé à chaque mise à jour.", ""];
  lines.push("## Candidatures", "");
  if (!apps.length) lines.push("Aucune candidature suivie pour l'instant.");
  else {
    lines.push("| Statut | Nombre |", "|---|---|", ...[...byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `| ${s} | ${n} |`));
    lines.push("", ...[...apps].sort((x, y) => Number(y.n) - Number(x.n)).slice(0, 15).map((a) => `- ${wikilink(`Candidatures/${applicationNoteName(a)}`, `${a.company} — ${a.role}`)}${a.score ? ` (${a.score})` : ""}`));
  }
  if (profiles.length) lines.push("", "## Profils de recherche", "", ...profiles.map((p) => `- ${wikilink(`Profils/${safeName(p.name)}`, p.name)}`));
  if (pending.length) lines.push("", `## Offres à trier (${pending.length})`, "", ...pending.slice(0, 40).map((o) => `- [${o.role || "Offre"}](${o.url}) — ${o.company}${o.location ? `, ${o.location}` : ""}`));
  return { props, block: lines.join("\n") };
}
