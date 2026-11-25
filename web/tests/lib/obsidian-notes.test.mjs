import { test } from "node:test";
import assert from "node:assert/strict";

import { BLOCK_START, BLOCK_END, applicationNote, applicationNoteName, companyNote, mergeNote, safeName, scoreNumber, wikilink, yamlLines } from "../../src/lib/obsidian-notes.mjs";

const app = { n: "7", date: "2026-11-12", company: "Crit", role: "Technicien: support / réseau", location: "Béthune (62)", score: "4.2/5", status: "Evaluated", url: "[careers](https://crit.example/o/1)", pdf: "✅", notes: "À relancer" };

test("safeName retire les caractères interdits des noms de fichier", () => {
  assert.equal(safeName('A/B: "C"?*'), "A B C");
  assert.equal(safeName("Poste #1 [urgent]"), "Poste 1 urgent");
  assert.equal(safeName("   "), "Sans nom");
  assert.equal(safeName("Fin avec point."), "Fin avec point");
});

test("les noms de candidature sont stables et triables", () => {
  assert.equal(applicationNoteName(app), "007 - Crit - Technicien support réseau");
});

test("yamlLines met entre guillemets les valeurs ambiguës et omet les vides", () => {
  const out = yamlLines({ a: "Béthune (62)", b: "2026-11-12", c: "oui", d: "x: y", e: "", f: ["un", "deux"], g: 4.2, h: true });
  assert.ok(out.includes("a: Béthune (62)"));
  assert.ok(out.includes('b: "2026-11-12"'));
  assert.ok(out.includes('d: "x: y"'));
  assert.ok(!out.some((l) => l.startsWith("e:")));
  assert.ok(out.includes("f:") && out.includes("  - deux"));
  assert.ok(out.includes("g: 4.2") && out.includes("h: true"));
});

test("scoreNumber lit la note sur 5", () => {
  assert.equal(scoreNumber("4,5/5"), 4.5);
  assert.equal(scoreNumber("N/A"), null);
});

test("applicationNote : propriétés, lien vers l'entreprise et rapport", () => {
  const { props, block } = applicationNote(app, "# Rapport\n\nContenu");
  assert.equal(props.note, 4.2);
  assert.equal(props.lien, "https://crit.example/o/1");
  assert.equal(props.cv_pdf, true);
  assert.deepEqual(props.tags, ["jobiify", "statut/evaluated"]);
  assert.ok(block.includes("[[Entreprises/Crit|Crit]]"));
  assert.ok(block.includes("### Rapport"));
});

test("companyNote liste les candidatures avec des liens vers leurs notes", () => {
  const { block, props } = companyNote("Crit", [app, { ...app, n: "9", role: "Autre" }]);
  assert.equal(props.candidatures, 2);
  assert.ok(block.indexOf("009 - Crit - Autre") < block.indexOf("007 - Crit"), "la plus récente d'abord");
  assert.ok(block.includes(wikilink("Candidatures/007 - Crit - Technicien support réseau", app.role)));
});

test("mergeNote crée une note avec un espace « Mes notes »", () => {
  const out = mergeNote(null, { jobiify: "candidature", note: 4 }, "Corps");
  assert.ok(out.startsWith("---\njobiify: candidature\nnote: 4\n---"));
  assert.ok(out.includes(`${BLOCK_START}\nCorps\n${BLOCK_END}`));
  assert.ok(out.includes("## Mes notes"));
});

test("mergeNote conserve vos notes et vos propriétés à la mise à jour", () => {
  const first = mergeNote(null, { jobiify: "candidature", statut: "Evaluated" }, "Ancien");
  const edited = first
    .replace("---\n", "---\nmon_tag: important\nautres:\n  - a\n  - b\n")
    .replace("## Mes notes\n", "## Mes notes\nAppeler le recruteur mardi\n");
  const next = mergeNote(edited, { jobiify: "candidature", statut: "Applied" }, "Nouveau");
  assert.ok(next.includes("statut: Applied") && !next.includes("Evaluated"));
  assert.ok(next.includes("mon_tag: important") && next.includes("  - b"));
  assert.ok(next.includes("Appeler le recruteur mardi"));
  assert.ok(next.includes("Nouveau") && !next.includes("Ancien"));
  assert.equal(mergeNote(next, { jobiify: "candidature", statut: "Applied" }, "Nouveau"), next, "idempotent");
});

test("mergeNote n'écrase rien si les marqueurs ont été supprimés", () => {
  const next = mergeNote("---\njobiify: x\n---\n\nMon texte libre\n", { jobiify: "candidature" }, "Bloc");
  assert.ok(next.includes("Mon texte libre"));
  assert.ok(next.includes(`${BLOCK_START}\nBloc\n${BLOCK_END}`));
});

test("safeName évite les noms réservés de Windows", () => {
  for (const n of ["CON", "nul", "Aux", "COM1", "lpt9", "con.txt"]) assert.match(safeName(n), /\(note\)$/, n);
  assert.equal(safeName("CON"), "CON (note)");
  assert.equal(safeName("Console"), "Console");
  assert.equal(safeName("Nulle part"), "Nulle part");
});
