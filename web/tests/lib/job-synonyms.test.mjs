import { test } from "node:test";
import assert from "node:assert/strict";

import { expandTitles, genderVariants } from "../../src/lib/job-synonyms.mjs";

test("expandTitles ajoute la famille métier d'un poste", () => {
  const s = expandTitles(["Technicien informatique"]);
  for (const want of ["technicien support", "helpdesk", "technicien de proximité", "support informatique"]) {
    assert.ok(s.includes(want), `${want} manquant dans ${s.join(", ")}`);
  }
  assert.ok(!s.some((x) => x.toLowerCase() === "technicien informatique"), "le poste d'origine n'est pas répété");
});

test("expandTitles gère le féminin et ne confond pas les abréviations", () => {
  const s = expandTitles(["Aide-soignante"]);
  assert.ok(s.includes("aide-soignant"), "variante masculine attendue");
  assert.ok(s.includes("agent de service hospitalier"), "famille santé attendue");
  // "ide" (infirmier) est un mot à part entière, pas un morceau de "aide".
  assert.ok(!s.includes("infirmier"), `famille infirmier ajoutée à tort : ${s.join(", ")}`);
});

test("expandTitles reste vide pour un intitulé inconnu et dédoublonne sans accents", () => {
  assert.deepEqual(expandTitles(["Astronaute"]).filter((x) => !/astronaut/.test(x)), []);
  const s = expandTitles(["Développeur web", "developpeur web"]);
  assert.equal(new Set(s.map((x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase())).size, s.length);
});

test("expandTitles ne mélange pas les domaines", () => {
  const s = expandTitles(["Cariste"]);
  assert.ok(s.includes("préparateur de commandes"));
  assert.ok(!s.some((x) => /développeur|helpdesk/.test(x)), `domaine informatique ajouté à tort : ${s.join(", ")}`);
});

test("genderVariants", () => {
  assert.ok(genderVariants("technicien support").includes("technicienne support"));
  assert.ok(genderVariants("développeuse web").includes("développeur web"));
  assert.ok(genderVariants("assistant administratif", { firstWordOnly: true }).includes("assistante administratif"));
});
