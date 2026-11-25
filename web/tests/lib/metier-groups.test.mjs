import { test } from "node:test";
import assert from "node:assert/strict";

import { cleanTitle, groupByMetier, matchProfile, metierOf } from "../../src/lib/metier-groups.mjs";

test("cleanTitle retire H/F et les majuscules criardes", () => {
  assert.equal(cleanTitle("CARISTE H/F"), "Cariste");
  assert.equal(cleanTitle("Cariste (h/f)"), "Cariste");
  assert.equal(cleanTitle("Technicien de maintenance F/H/X -"), "Technicien de maintenance");
});

test("un titre est rattaché à sa famille de métiers, sans accents ni H/F", () => {
  assert.equal(metierOf("PREPARATEUR DE COMMANDES H/F").label, "Logistique (cariste, préparateur, magasinier)");
  assert.equal(metierOf("Magasinier cariste (H/F)").key, metierOf("cariste").key);
  assert.equal(metierOf("Plaquiste").label, "Second œuvre (peintre, plaquiste, menuisier…)");
  assert.equal(metierOf("Technicien helpdesk N1").label, "Technicien informatique");
});

test("le métier le plus précis l'emporte", () => {
  // « technicien de maintenance informatique » est plus long que « technicien de maintenance ».
  assert.equal(metierOf("Technicien de maintenance informatique").label, "Technicien informatique");
  assert.equal(metierOf("Technicien de maintenance industrielle").label, "Maintenance industrielle");
});

test("hors des familles connues, les deux premiers mots font le métier", () => {
  assert.equal(metierOf("Chargé de mission développement durable").key, "t:charge mission");
  assert.equal(metierOf("").key, "");
});

const offer = (title, extra = {}) => ({ title, company: "X", location: "Béthune", source: "meteojob", ...extra });

test("groupByMetier compte, trie et signale les métiers couverts par le profil", () => {
  const offers = [
    ...Array.from({ length: 5 }, (_, i) => offer("Cariste H/F", { company: `C${i}` })),
    ...Array.from({ length: 3 }, (_, i) => offer("Technicien informatique", { company: `T${i}` })),
    offer("Astronaute", { company: "Z" }),
  ];
  const groups = groupByMetier(offers, { profileTerms: ["technicien informatique"] });
  assert.deepEqual(groups.map((g) => [g.label, g.count, g.inProfile]), [["Logistique (cariste, préparateur, magasinier)", 5, false], ["Technicien informatique", 3, true]]);
  assert.equal(groups[0].sources.meteojob, 5);
});

test("la même offre vue sur deux sources ne compte qu'une fois", () => {
  const groups = groupByMetier(
    [offer("Cariste H/F", { company: "Adecco", source: "meteojob" }), offer("CARISTE", { company: "ADECCO", source: "france-travail" }), offer("Cariste", { company: "Crit" })],
    { minCount: 1 },
  );
  assert.equal(groups[0].count, 2);
});

test("les mots exclus du profil écartent les offres, les groupes isolés disparaissent", () => {
  const groups = groupByMetier([offer("Cariste stage", { company: "A" }), offer("Cariste", { company: "B" }), offer("Cariste", { company: "C" })], { negative: ["stage"] });
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groupByMetier([offer("Poseur de parquet")], {}), [], "un seul exemplaire : bruit");
});

test("matchProfile compte les offres des postes visés, sans doublons ni mots exclus", () => {
  const offers = [
    offer("Technicien informatique H/F", { company: "Crit" }),
    offer("TECHNICIEN INFORMATIQUE", { company: "CRIT" }),
    offer("Technicien support informatique", { company: "Adecco" }),
    offer("Technicien informatique en alternance", { company: "Autre" }),
    offer("Cariste", { company: "Z" }),
  ];
  const m = matchProfile(offers, { profileTerms: ["technicien informatique", "support informatique"], negative: ["alternance"] });
  assert.equal(m.count, 2);
  assert.deepEqual(matchProfile(offers, {}), { count: 0, examples: [] });
});
