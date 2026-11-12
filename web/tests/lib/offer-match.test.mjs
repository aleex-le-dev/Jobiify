import { test } from "node:test";
import assert from "node:assert/strict";

import { dedupeKey, firstMatch, foldText, isBlockedLocation, looksRemote, matchesKeyword, titlePasses } from "../../src/lib/offer-match.mjs";

test("foldText retire accents, casse et écriture inclusive", () => {
  assert.equal(foldText("TECHNICIEN Informatique H/F"), "technicien informatique h f");
  assert.equal(foldText("Technicien(ne) de proximité"), "technicien de proximite");
  assert.equal(foldText("Technicien·ne réseau"), "technicien reseau");
  assert.equal(foldText("Manœuvre"), "manoeuvre");
});

test("un titre sans accent ou en majuscules correspond au poste du profil", () => {
  assert.ok(matchesKeyword("DEVELOPPEUR WEB H/F", "développeur web"));
  assert.ok(matchesKeyword("Développeur Web", "developpeur web"));
  assert.ok(matchesKeyword("Technicien(ne) informatique", "technicien informatique"));
});

test("les mots du poste peuvent être séparés ou dans un autre ordre", () => {
  assert.ok(matchesKeyword("Technicien de maintenance informatique (H/F)", "technicien informatique"));
  assert.ok(matchesKeyword("Technicienne support et réseaux informatique", "technicien informatique"));
  assert.ok(matchesKeyword("Support IT niveau 2", "it support"));
  assert.ok(matchesKeyword("Techniciens réseaux", "technicien réseau"));
});

test("un seul mot commun ne suffit pas", () => {
  assert.ok(!matchesKeyword("Technicien de maintenance industrielle", "technicien informatique"));
  assert.ok(!matchesKeyword("Agent de production", "agent de sécurité"));
  assert.ok(!matchesKeyword("Commercialisation de logiciels", "commercial sédentaire"));
});

test("les mots-clés courts sont des mots entiers", () => {
  assert.ok(matchesKeyword("IDE en EHPAD", "ide"));
  assert.ok(!matchesKeyword("Aide soignante", "ide"));
  assert.ok(!matchesKeyword("Technicien de site", "it"));
});

test("titlePasses applique les exclusions avant les postes visés", () => {
  const filters = { positive: ["technicien informatique", "helpdesk"], negative: ["stage", "alternance"] };
  assert.ok(titlePasses("Technicien informatique H/F", filters));
  assert.ok(titlePasses("Technicien Helpdesk N1", filters));
  assert.ok(!titlePasses("Technicien informatique en alternance", filters));
  assert.ok(!titlePasses("Stage technicien informatique", filters));
  assert.ok(!titlePasses("Cariste", filters));
  assert.ok(titlePasses("Cariste", { positive: [], negative: ["stage"] }), "sans poste défini, tout passe");
});

test("firstMatch renvoie le poste reconnu", () => {
  assert.equal(firstMatch("TECHNICIEN SUPPORT INFORMATIQUE", ["cariste", "support informatique"]), "support informatique");
  assert.equal(firstMatch("Boulanger", ["cariste"]), undefined);
});

test("isBlockedLocation ne confond pas Calais et Pas-de-Calais", () => {
  assert.ok(isBlockedLocation("Calais (62)", ["Calais"]));
  assert.ok(!isBlockedLocation("Béthune, Pas-de-Calais", ["Calais"]));
  assert.ok(!isBlockedLocation("Béthune", []));
});

test("looksRemote reconnaît le télétravail", () => {
  assert.ok(looksRemote("Lille", "Développeur — 100% télétravail"));
  assert.ok(looksRemote("Full remote"));
  assert.ok(!looksRemote("Béthune", "Technicien itinérant"));
});

test("dedupeKey rapproche la même offre publiée par deux sources", () => {
  const a = dedupeKey({ title: "Cariste (H/F)", company: "ADECCO", location: "Béthune (62)" });
  const b = dedupeKey({ title: "CARISTE F/H", company: "Adecco", location: "Béthune, France" });
  assert.equal(a, b);
  assert.notEqual(a, dedupeKey({ title: "Cariste (H/F)", company: "Adecco", location: "Lens (62)" }));
  assert.equal(dedupeKey({ title: "Cariste", company: "Entreprise non communiquée", location: "Béthune" }), "", "employeur inconnu : pas de fusion");
});
