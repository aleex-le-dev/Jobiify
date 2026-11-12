/**
 * Mise en forme d'un cv.md pour l'aperçu (affichage seulement : le fichier
 * garde son format, que les outils de vérification du CV lisent).
 *
 * - « # CV -- Prénom Nom » devient « # Prénom Nom ».
 * - Les lignes de coordonnées sous le titre (« **E-mail:** … ») sont réunies
 *   en une seule ligne « valeur · valeur · … », juste sous le nom.
 * - Chaque poste « ### Entreprise -- Ville / **Intitulé** / dates » devient
 *   « ### Intitulé » suivi de « **Entreprise** · Ville · dates ».
 * - Les doubles tirets « -- » (règle ATS du fichier) s'affichent en « – ».
 */

const CONTACT_LINE = /^\*\*([^*\n]+?)\s*:?\s*\*\*\s*:?\s*(.+)$/;

/** @param {string} markdown */
export function formatCvPreview(markdown) {
  if (!markdown) return "";
  const text = String(markdown).replace(/\r\n?/g, "\n");

  // En-tête = tout ce qui précède la première section « ## ».
  const firstSection = text.search(/^##\s/m);
  const head = firstSection === -1 ? text : text.slice(0, firstSection);
  let body = firstSection === -1 ? "" : text.slice(firstSection);

  const titleLines = [];
  const contacts = [];
  const others = [];
  for (const raw of head.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#\s/.test(line)) {
      titleLines.push(line.replace(/^#\s+CV\s*[-–—]+\s*/i, "# "));
      continue;
    }
    const c = line.match(CONTACT_LINE);
    if (c) contacts.push(c[2].trim());
    else others.push(line);
  }

  const headOut = [
    ...titleLines,
    contacts.length ? contacts.join(" · ") : null,
    ...others,
  ].filter(Boolean).join("\n\n");

  // Postes : intitulé en titre, entreprise · lieu · dates en sous-titre.
  const job = /^###\s+([^\n#]+?)(?:\s+[-–—]{1,2}\s+([^\n#]+))?\n+(\*\*[^*\n]+\*\*)\n+([^\n]+)/gm;
  body = body.replace(job, (_, company, location, roleBold, dates) => {
    const role = roleBold.replace(/^\*\*|\*\*$/g, "").trim();
    const loc = location ? ` · ${location.trim()}` : "";
    const dt = dates.trim() ? ` · ${dates.trim()}` : "";
    return `### ${role}\n\n**${company.trim()}**${loc}${dt}\n`;
  });

  const out = `${headOut}\n\n${body}`.trim();
  return out.replace(/ -- /g, " – ").replace(/(\d)\s*--\s*(\d|Présent|présent|Aujourd)/g, "$1 – $2");
}
