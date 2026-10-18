import { test } from "node:test";
import assert from "node:assert/strict";

import "../../helpers/web-ts-alias-loader.mjs";

const { haversineKm, makeCirclePolygon, inZone, norm } = await import("../../../src/lib/core/zone.ts");

test("haversineKm calcule une distance réaliste entre communes", () => {
  // Lières [2.4178, 50.5539] -> Béthune [2.64, 50.53] ~16 km
  const d = haversineKm([2.4178, 50.5539], [2.64, 50.53]);
  assert.ok(d > 14 && d < 18, `Distance attendue ~16 km, calculé: ${d}`);
});

test("inZone filtre précisément par GPS, code INSEE, code postal et nom de commune", () => {
  const origin = [2.4178, 50.5539]; // Lières
  const polygon = makeCirclePolygon(origin, 25); // 25 km autour de Lières

  const communes = [
    { nom: "Lières", code: "62508", codesPostaux: ["62190"] },
    { nom: "Lillers", code: "62516", codesPostaux: ["62190"] },
    { nom: "Auchel", code: "62048", codesPostaux: ["62260"] },
    { nom: "Béthune", code: "62119", codesPostaux: ["62400"] },
    { nom: "Bruay-la-Buissière", code: "62178", codesPostaux: ["62700"] },
  ];

  const zone = {
    origin,
    polygon,
    communes,
    minutes: 25,
    villeDepart: "Lières",
    generatedAt: new Date().toISOString(),
    method: "haversine-fallback",
    codes: new Set(communes.map((c) => c.code)),
    noms: new Set(communes.map((c) => norm(c.nom))),
    cps: new Set(communes.flatMap((c) => c.codesPostaux)),
  };

  // 1. Coordonnées GPS précises
  assert.equal(inZone({ lon: 2.4178, lat: 50.5539 }, zone), "oui", "Lières GPS doit être oui");
  assert.equal(inZone({ lon: 2.64, lat: 50.53 }, zone), "oui", "Béthune GPS doit être oui");
  assert.equal(inZone({ lon: 2.35, lat: 48.85 }, zone), "non", "Paris GPS doit être non");

  // 2. Code INSEE
  assert.equal(inZone({ codeInsee: "62508" }, zone), "oui", "INSEE 62508 doit être oui");
  assert.equal(inZone({ codeInsee: "75056" }, zone), "non", "INSEE Paris doit être non");

  // 3. Code Postal
  assert.equal(inZone({ ville: "Commune (62190)" }, zone), "oui", "CP 62190 doit être oui");
  assert.equal(inZone({ ville: "Béthune 62400" }, zone), "oui", "CP 62400 doit être oui");

  // 4. Nom de commune
  assert.equal(inZone({ ville: "Lillers" }, zone), "oui", "Nom Lillers doit être oui");
  assert.equal(inZone({ ville: "Auchel, France" }, zone), "oui", "Nom Auchel, France doit être oui");
  assert.equal(inZone({ ville: "Bruay-la-Buissière" }, zone), "oui", "Nom avec tirets doit être oui");

  // 5. Villes hors zone
  assert.equal(inZone({ ville: "Paris" }, zone), "non", "Paris doit être non");
  assert.equal(inZone({ ville: "Nanterre" }, zone), "non", "Nanterre doit être non");
  assert.equal(inZone({ ville: "Toulouse" }, zone), "non", "Toulouse doit être non");

  // 6. Lieux génériques ou vides
  assert.equal(inZone({ ville: "Pas-de-Calais" }, zone), "inconnu", "Pas-de-Calais générique doit être inconnu");
  assert.equal(inZone({}, zone), "inconnu", "Objet vide doit être inconnu");
});
