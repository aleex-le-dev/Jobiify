import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCvPreview } from "../../src/lib/cv/cv-preview-format.mjs";

const CV = `# CV -- Camille Martin

**Localisation:** 12 rue de la Gare, 62400 Béthune
**E-mail:** camille@example.com
**Téléphone:** 06 00 00 00 00

## Profil professionnel

Cariste confirmée.

## Expériences professionnelles

### Logistique Nord -- Lillers

**Cariste CACES 3**

2021-2024

- Chargement des camions
`;

test("le titre perd le préfixe « CV -- »", () => {
  assert.match(formatCvPreview(CV), /^# Camille Martin$/m);
});

test("les coordonnées tiennent sur une ligne, sans étiquettes", () => {
  const out = formatCvPreview(CV);
  assert.match(out, /^12 rue de la Gare, 62400 Béthune · camille@example\.com · 06 00 00 00 00$/m);
  assert.doesNotMatch(out, /\*\*E-mail/);
});

test("un poste affiche l'intitulé en titre et l'entreprise en sous-titre", () => {
  const out = formatCvPreview(CV);
  assert.match(out, /^### Cariste CACES 3$/m);
  assert.match(out, /^\*\*Logistique Nord\*\* · Lillers · 2021-2024$/m);
});

test("les sections et les puces sont conservées", () => {
  const out = formatCvPreview(CV);
  assert.match(out, /^## Profil professionnel$/m);
  assert.match(out, /^- Chargement des camions$/m);
});

test("CRLF et CV vide", () => {
  assert.match(formatCvPreview(CV.replace(/\n/g, "\r\n")), /^# Camille Martin$/m);
  assert.equal(formatCvPreview(""), "");
});
