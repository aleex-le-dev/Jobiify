import { describe, it } from "node:test";
import assert from "node:assert/strict";

import "../helpers/web-ts-alias-loader.mjs";

const {
  toTitleCase,
  normalizeDateToIso,
  formatLocationCity,
  formatPublicationDate,
} = await import("../../src/lib/format.ts");

describe("toTitleCase", () => {
  it("formats words and hyphenated compound city names preserving accents", () => {
    assert.equal(toTitleCase("LILLERS"), "Lillers");
    assert.equal(toTitleCase("HÉNIN-BEAUMONT"), "Hénin-Beaumont");
    assert.equal(toTitleCase("SAINT-LAURENT-BLANGY"), "Saint-Laurent-Blangy");
    assert.equal(toTitleCase("NOEUX LES MINES"), "Noeux Les Mines");
  });
});

describe("normalizeDateToIso", () => {
  it("converts French DD/MM/YYYY into ISO YYYY-MM-DD", () => {
    assert.equal(normalizeDateToIso("07/01/2026"), "2026-01-07");
    assert.equal(normalizeDateToIso("31/12/2025"), "2025-12-31");
  });

  it("preserves or truncates standard ISO dates to YYYY-MM-DD", () => {
    assert.equal(normalizeDateToIso("2026-10-16"), "2026-10-16");
    assert.equal(normalizeDateToIso("2026-10-16T14:30:00Z"), "2026-10-16");
  });

  it("handles empty or invalid gracefully", () => {
    assert.equal(normalizeDateToIso(""), "");
    assert.equal(normalizeDateToIso(null), "");
  });
});

describe("formatLocationCity", () => {
  it("extracts city and postal code from public sector addresses with colons", () => {
    assert.equal(
      formatLocationCity("5 Place Roger Salengro - BP 9 : 62192 Lillers"),
      "Lillers (62192)",
    );
    assert.equal(
      formatLocationCity("6 rue du général Daullé : 62140 Marconnelle"),
      "Marconnelle (62140)",
    );
    assert.equal(
      formatLocationCity("MDS de l'Arrageois - parc haute technologie des Bonnettes - 11, rue Willy Brandt : 62018 Arras"),
      "Arras (62018)",
    );
    assert.equal(
      formatLocationCity("1 place jean jaurès - cs 90109 : 62252 Hénin-Beaumont"),
      "Hénin-Beaumont (62252)",
    );
  });

  it("extracts city from street addresses with postal codes and trailing country", () => {
    assert.equal(
      formatLocationCity("120 RUE DE L’ÉGALITÉ - 62290 NOEUX LES MINES, FRANCE"),
      "Noeux Les Mines (62290)",
    );
    assert.equal(
      formatLocationCity("25 RUE DE PERNES 62190 LILLERS"),
      "Lillers (62190)",
    );
  });

  it("extracts city from departmental prefixes", () => {
    assert.equal(formatLocationCity("62 - LILLERS"), "Lillers (62)");
    assert.equal(formatLocationCity("62 - BETHUNE"), "Bethune (62)");
  });

  it("handles city with parenthetical postal code", () => {
    assert.equal(formatLocationCity("Lillers (62190)"), "Lillers (62190)");
    assert.equal(formatLocationCity("Béthune (62400)"), "Béthune (62400)");
  });

  it("extracts city when street address is separated by comma", () => {
    assert.equal(formatLocationCity("12 rue victor hugo, Lillers"), "Lillers");
    assert.equal(formatLocationCity("Béthune, Hauts-de-France, France"), "Béthune");
  });

  it("handles bare city names", () => {
    assert.equal(formatLocationCity("ARRAS"), "Arras");
    assert.equal(formatLocationCity("LENS"), "Lens");
  });
});

describe("formatPublicationDate", () => {
  it("formats French date strings with readable localized text", () => {
    const res = formatPublicationDate("07/01/2026", true);
    assert.equal(res.formattedDate, "7 janv. 2026");
    assert.ok(res.label?.startsWith("Publié"));
  });

  it("formats relative strings gracefully", () => {
    const res = formatPublicationDate("hier", true);
    assert.equal(res.label, "Publié hier");
  });
});
