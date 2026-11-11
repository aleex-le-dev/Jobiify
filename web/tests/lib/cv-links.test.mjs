import { test } from "node:test";
import assert from "node:assert/strict";

import { applyLinksToCv, cleanLinks, detectKind, displayUrl } from "../../src/lib/cv-links.mjs";

const CV = `# CV -- Alex

**Location:** Béthune, France
**Email:** alex@example.com
**LinkedIn:** linkedin.com/in/ancien

## Expérience

**LinkedIn:** cette ligne est dans le corps, pas dans l'en-tête
`;

test("detectKind reconnaît les sites courants et retombe sur Portfolio", () => {
  assert.equal(detectKind("https://www.linkedin.com/in/alex").label, "LinkedIn");
  assert.equal(detectKind("github.com/alex").label, "GitHub");
  assert.equal(detectKind("alex.github.io").label, "GitHub");
  assert.equal(detectKind("https://www.malt.fr/profile/alex").label, "Malt");
  assert.equal(detectKind("alex-dev.fr").label, "Portfolio");
});

test("displayUrl raccourcit sans perdre le chemin", () => {
  assert.equal(displayUrl("https://www.linkedin.com/in/alex/"), "linkedin.com/in/alex");
  assert.equal(displayUrl("github.com/alex"), "github.com/alex");
  assert.equal(displayUrl("javascript:alert(1)"), "");
});

test("cleanLinks rejette les URL invalides et les doublons de libellé", () => {
  const out = cleanLinks([
    { url: "github.com/alex" },
    { url: "pas une url" },
    { url: "javascript:alert(1)" },
    { label: "GitHub", url: "github.com/autre" },
    { label: "Mon **site**:", url: "alex.fr" },
  ]);
  assert.deepEqual(out.map((l) => l.label), ["GitHub", "Mon site"]);
});

test("applyLinksToCv met à jour, ajoute et retire uniquement dans l'en-tête", () => {
  const md = applyLinksToCv(
    CV,
    [
      { label: "LinkedIn", url: "https://www.linkedin.com/in/alex-nouveau/" },
      { label: "GitHub", url: "https://github.com/alex" },
    ],
    [],
  );
  assert.match(md, /\*\*LinkedIn:\*\* linkedin\.com\/in\/alex-nouveau\n\*\*GitHub:\*\* github\.com\/alex\n/);
  assert.ok(!md.includes("linkedin.com/in/ancien"));
  assert.ok(md.includes("cette ligne est dans le corps"), "le corps du CV n'est pas touché");

  const removed = applyLinksToCv(md, [], ["GitHub"]);
  assert.ok(!removed.includes("**GitHub:**"));
  assert.ok(removed.includes("**LinkedIn:** linkedin.com/in/alex-nouveau"));
});

test("applyLinksToCv insère sous le titre quand il n'y a aucune ligne de contact", () => {
  const md = applyLinksToCv("# CV -- Alex\n\n## Profil\n", [{ label: "GitHub", url: "github.com/alex" }]);
  assert.equal(md, "# CV -- Alex\n\n**GitHub:** github.com/alex\n\n## Profil\n");
});
