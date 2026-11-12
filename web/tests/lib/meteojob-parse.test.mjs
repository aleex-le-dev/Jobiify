import { test } from "node:test";
import assert from "node:assert/strict";

import { parseMeteojobPage } from "../../src/lib/meteojob-parse.mjs";

const page = (state) => `<html><body><script id="candidate-front-state" type="application/json">${JSON.stringify(state)}</script></body></html>`;

test("parseMeteojobPage lit les offres du bloc d'état", () => {
  const { total, jobs } = parseMeteojobPage(
    page({
      "app:search:offers": {
        total: 31,
        content: [
          {
            id: 57857080,
            title: "Cariste (h/f)",
            publicationDate: "2026-11-02T19:06:49.595Z",
            locality: "Calonne-Ricouart (62) - Hauts-de-France",
            contractTypes: ["INTERIM"],
            company: { name: "ADECCO" },
            locations: [{ name: "Calonne-Ricouart (62)", lat: 50.48, lon: 2.48 }],
          },
          { id: "2", title: "Magasinier", recruiter: "Synergie", locations: [{ name: "Béthune (62)" }] },
          { id: "", title: "sans identifiant" },
          { id: "4" },
        ],
      },
    }),
  );
  assert.equal(total, 31);
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs[0], {
    id: "57857080",
    title: "Cariste (h/f)",
    company: "ADECCO",
    locality: "Calonne-Ricouart (62)",
    lat: 50.48,
    lon: 2.48,
    publicationDate: "2026-11-02T19:06:49.595Z",
    contracts: ["INTERIM"],
  });
  assert.equal(jobs[1].company, "Synergie");
  assert.equal(jobs[1].locality, "Béthune (62)");
  assert.equal(jobs[1].lat, undefined);
});

test("parseMeteojobPage ne casse pas sur une page inattendue", () => {
  assert.deepEqual(parseMeteojobPage("<html>maintenance</html>"), { total: 0, jobs: [] });
  assert.deepEqual(parseMeteojobPage('<script id="candidate-front-state" type="application/json">{pas du json</script>'), { total: 0, jobs: [] });
  assert.deepEqual(parseMeteojobPage(page({ autre: 1 })), { total: 0, jobs: [] });
  assert.deepEqual(parseMeteojobPage(undefined), { total: 0, jobs: [] });
});
