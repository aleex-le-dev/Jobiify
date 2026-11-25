import { test } from "node:test";
import assert from "node:assert/strict";

import { applyMark, markOf, normalizeMarks, offerIds } from "../../src/lib/offer-marks.mjs";

const adzuna = { url: "https://adzuna.example/1", title: "Technicien informatique H/F", company: "E.Leclerc", location: "Bailleul (59)" };
const meteo = { url: "https://meteojob.example/9", title: "TECHNICIEN INFORMATIQUE", company: "E.LECLERC", location: "Bailleul" };

test("une offre est reconnue par son URL et par poste/entreprise/ville", () => {
  const ids = offerIds(adzuna);
  assert.equal(ids[0], "u:https://adzuna.example/1");
  assert.ok(ids[1].startsWith("k:"));
});

test("classer une offre la classe aussi sur les autres sources", () => {
  const store = applyMark({}, [adzuna], "applied", "2026-11-24T10:00:00Z");
  assert.equal(markOf(store, adzuna), "applied");
  assert.equal(markOf(store, meteo), "applied", "même offre, autre URL");
  assert.equal(markOf(store, { ...meteo, company: "Autre", url: "https://x.example/2" }), undefined);
});

test("une offre sans employeur connu n'est reconnue que par son URL", () => {
  const anon = { url: "https://x.example/3", title: "Cariste", company: "Entreprise non communiquée", location: "Lens" };
  const store = applyMark({}, [anon], "dismissed");
  assert.equal(markOf(store, anon), "dismissed");
  assert.equal(markOf(store, { ...anon, url: "https://x.example/4" }), undefined);
});

test("mark null remet l'offre dans les nouvelles, partout", () => {
  const store = applyMark(applyMark({}, [adzuna], "dismissed"), [meteo], null);
  assert.equal(markOf(store, adzuna), undefined);
  assert.equal(markOf(store, meteo), undefined);
});

test("changer de catégorie remplace l'ancien classement", () => {
  const store = applyMark(applyMark({}, [adzuna], "dismissed"), [adzuna], "applied");
  assert.equal(markOf(store, adzuna), "applied");
});

test("normalizeMarks ignore ce qui n'est pas un classement valide", () => {
  const store = normalizeMarks({ marks: { "u:a": { mark: "applied", at: "x" }, "u:b": { mark: "bidon" }, autre: { mark: "applied" }, "k:c": null } });
  assert.deepEqual(Object.keys(store), ["u:a"]);
  assert.deepEqual(normalizeMarks(null), {});
  assert.deepEqual(normalizeMarks("pas du json"), {});
});
