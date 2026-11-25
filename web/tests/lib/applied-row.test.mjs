import { test } from "node:test";
import assert from "node:assert/strict";

import { ADVANCED_STATUSES, appliedTsv, comparableUrl, findExistingApplication } from "../../src/lib/applied-row.mjs";

const apps = [
  { n: "3", company: "Crit", role: "Technicien réseau (H/F)", url: "[careers](https://crit.example/o/1?utm_source=x)", status: "Evaluated" },
  { n: "4", company: "Boulanger", role: "Technicien de proximité", url: "", status: "Applied" },
];

test("comparableUrl ignore fragment, suivi marketing et « / » final", () => {
  assert.equal(comparableUrl("https://Crit.example/o/1/?utm_source=a#top"), "crit.example/o/1");
  assert.equal(comparableUrl("[x](https://a.example/p?id=3)"), "a.example/p?id=3");
  assert.equal(comparableUrl("pas une url"), "");
});

test("une offre déjà suivie est retrouvée par son URL", () => {
  assert.equal(findExistingApplication(apps, { url: "https://crit.example/o/1", company: "?", title: "x" })?.n, "3");
});

test("ou par entreprise ET poste, sans tenir compte de H/F ni des accents", () => {
  assert.equal(findExistingApplication(apps, { url: "https://autre.example/9", company: "BOULANGER", title: "TECHNICIEN DE PROXIMITE F/H" })?.n, "4");
  assert.equal(findExistingApplication(apps, { url: "https://autre.example/9", company: "Boulanger", title: "Cariste" }), undefined);
});

test("un employeur inconnu ne fusionne jamais sur le nom", () => {
  const anon = [{ n: "9", company: "Entreprise non communiquée", role: "Cariste", url: "", status: "Evaluated" }];
  assert.equal(findExistingApplication(anon, { url: "https://x.example/1", company: "Entreprise non communiquée", title: "Cariste" }), undefined);
});

test("les statuts déjà avancés ne sont pas repassés à Applied", () => {
  for (const s of ["Applied", "Interview", "Offer", "Rejected"]) assert.ok(ADVANCED_STATUSES.has(s));
  for (const s of ["Evaluated", "Discarded", "SKIP"]) assert.ok(!ADVANCED_STATUSES.has(s));
});

test("appliedTsv : en-tête, une ligne, score N/A et pas de rapport", () => {
  const [head, row, rest] = appliedTsv({ num: "012", today: "2026-11-25", company: "Crit", title: "Technicien\tréseau", location: "Béthune (62)", url: "https://crit.example/o/1", source: "meteojob" }).split("\n");
  assert.equal(rest, "");
  const labels = head.split("\t");
  const cells = row.split("\t");
  assert.equal(labels.length, cells.length);
  const at = (k) => cells[labels.indexOf(k)];
  assert.equal(at("status"), "Applied");
  assert.equal(at("score"), "N/A");
  assert.equal(at("report"), "—");
  assert.equal(at("role"), "Technicien réseau", "les tabulations sont aplaties");
  assert.equal(at("url"), "https://crit.example/o/1");
  assert.match(at("notes"), /source : meteojob/);
});

test("appliedTsv : employeur inconnu écrit « ? » avec une note", () => {
  const [head, row] = appliedTsv({ num: "013", today: "2026-11-25", company: "Entreprise non communiquée", title: "Cariste", url: "https://x.example/1" }).split("\n");
  const at = (k) => row.split("\t")[head.split("\t").indexOf(k)];
  assert.equal(at("company"), "?");
  assert.match(at("notes"), /employeur non communiqué/);
});
