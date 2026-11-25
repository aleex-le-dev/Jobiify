import { test } from "node:test";
import assert from "node:assert/strict";

import { suggestExcludedWord, suggestMutedCompany } from "../../src/lib/dismiss-suggestions.mjs";
import { applyMark, markOf, muteCompany } from "../../src/lib/offer-marks.mjs";

const profile = ["Technicien informatique", "Technicien support"];

test("un mot qui revient dans deux offres écartées est proposé à l'exclusion", () => {
  const dismissed = [{ title: "Technicien automobile robotique" }, { title: "Technicien AUTOMOBILE (H/F)" }];
  assert.deepEqual(suggestExcludedWord(dismissed[1], dismissed, profile, []), { word: "automobile", count: 2 });
});

test("un seul refus ne suffit pas", () => {
  const one = [{ title: "Technicien automobile" }];
  assert.equal(suggestExcludedWord(one[0], one, profile, []), null);
});

test("jamais un mot du profil, une exclusion existante ou un mot générique", () => {
  const d = [{ title: "Technicien informatique industrielle" }, { title: "Technicien informatique agricole" }, { title: "Agent polyvalent industrielle" }];
  assert.equal(suggestExcludedWord(d[0], d, profile, []).word, "industrielle", "« informatique » est dans le profil");
  assert.equal(suggestExcludedWord(d[0], d, profile, ["industrielle"]), null, "déjà exclu");
  const generic = [{ title: "Agent polyvalent" }, { title: "Agent polyvalent confirmé" }];
  assert.equal(suggestExcludedWord(generic[0], generic, profile, []), null);
});

test("masquer l'entreprise n'est proposé que s'il y a d'autres offres de cette entreprise", () => {
  const others = [{ company: "MANPOWER" }, { company: "Crit" }];
  assert.deepEqual(suggestMutedCompany({ company: "Manpower" }, others), { company: "Manpower", others: 1 });
  assert.equal(suggestMutedCompany({ company: "Randstad" }, others), null);
  assert.equal(suggestMutedCompany({ company: "Entreprise non communiquée" }, [{ company: "Entreprise non communiquée" }]), null);
});

test("une entreprise masquée classe toutes ses offres, aujourd'hui et demain", () => {
  const store = muteCompany({}, "Manpower");
  assert.equal(markOf(store, { url: "https://a.example/1", title: "Cariste", company: "MANPOWER" }), "dismissed");
  assert.equal(markOf(store, { url: "https://b.example/2", title: "Autre", company: "Crit" }), undefined);
  assert.deepEqual(muteCompany({}, "Entreprise non communiquée"), {}, "employeur inconnu : sans effet");
});

test("remettre une offre dans les nouvelles réaffiche aussi son entreprise masquée", () => {
  const offer = { url: "https://a.example/1", title: "Cariste", company: "Manpower" };
  const store = applyMark(muteCompany({}, "Manpower"), [offer], null);
  assert.equal(markOf(store, offer), undefined);
});
