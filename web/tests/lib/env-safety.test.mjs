import { test } from "node:test";
import assert from "node:assert/strict";

import { EDITABLE_ENV_KEYS, isHttpUrl, validateEnvUpdates } from "../../src/lib/env-safety.mjs";

test("validateEnvUpdates accepte les clés connues et nettoie les guillemets", () => {
  const r = validateEnvUpdates({ JOOBLE_API_KEY: ' "abc-123" ', JOBIIFY_OBSIDIAN_DIR: "C:\\Users\\moi\\Coffre\\jobiify" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.clean, { JOOBLE_API_KEY: "abc-123", JOBIIFY_OBSIDIAN_DIR: "C:\\Users\\moi\\Coffre\\jobiify" });
});

test("validateEnvUpdates refuse une variable hors liste", () => {
  for (const key of ["NODE_OPTIONS", "PATH", "(.*)", "__proto__", "jooble_api_key"]) {
    const r = validateEnvUpdates({ [key]: "x" });
    assert.equal(r.ok, false, key);
  }
  assert.equal(EDITABLE_ENV_KEYS.includes("NODE_OPTIONS"), false);
});

test("validateEnvUpdates refuse les retours à la ligne et caractères de contrôle", () => {
  for (const v of ["ok\nNODE_OPTIONS=--require x", "ok\rX=1", "a\u0000b", "a\u2028b"]) {
    assert.equal(validateEnvUpdates({ JOOBLE_API_KEY: v }).ok, false, JSON.stringify(v));
  }
});

test("validateEnvUpdates refuse une valeur non texte ou démesurée", () => {
  assert.equal(validateEnvUpdates({ JOOBLE_API_KEY: 42 }).ok, false);
  assert.equal(validateEnvUpdates({ JOOBLE_API_KEY: "x".repeat(1001) }).ok, false);
});

test("isHttpUrl n'accepte que de vrais liens web", () => {
  assert.equal(isHttpUrl("https://www.meteojob.com/offres/1"), true);
  assert.equal(isHttpUrl(" http://exemple.fr/a?b=c "), true);
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>", "file:///C:/x", "//exemple.fr", "https://", "https://a b.fr", "https://x.fr/\nfoo", "", null, undefined]) {
    assert.equal(isHttpUrl(bad), false, String(bad));
  }
});
