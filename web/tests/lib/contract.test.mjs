import { test } from "node:test";
import assert from "node:assert/strict";

import { contractOf, normalizeContract } from "../../src/lib/offer-match.mjs";

test("normalizeContract comprend le vocabulaire des sources", () => {
  const cases = {
    CDI: ["CDI", "permanent", "Contrat à durée indéterminée"],
    CDD: ["CDD", "contract", "Contrat à durée déterminée", "SAI", "Saisonnier"],
    Intérim: ["INTERIM", "MIS", "Intérim", "Travail temporaire", "Mission"],
    Alternance: ["APPRENTICE", "Contrat d'apprentissage", "Alternance", "professionnalisation"],
    Stage: ["TRAINING", "Stage"],
    Indépendant: ["FREELANCE", "LIB", "Profession libérale"],
  };
  for (const [want, raws] of Object.entries(cases)) for (const raw of raws) assert.equal(normalizeContract(raw), want, `${raw} → ${want}`);
  assert.equal(normalizeContract(""), "");
  assert.equal(normalizeContract(undefined), "");
  assert.equal(normalizeContract("full_time"), "", "un temps de travail n'est pas un contrat");
});

test("contractOf : le contrat déclaré passe avant tout", () => {
  assert.equal(contractOf({ contract: "INTERIM", title: "Cariste CDI" }), "Intérim");
});

test("contractOf déduit le contrat du titre, de la note ou de la source", () => {
  assert.equal(contractOf({ title: "Cariste H/F - CDI" }), "CDI");
  assert.equal(contractOf({ title: "Magasinier", note: "CDD 6 mois" }), "CDD");
  assert.equal(contractOf({ title: "Magasinier", source: "interim-meteojob" }), "Intérim");
  assert.equal(contractOf({ title: "Boulanger en alternance" }), "Alternance");
  assert.equal(contractOf({ title: "Technicien informatique" }), "");
});
