// Essai bout en bout de « Pas intéressé » et de ses suggestions, avec un flux de
// résultats et des réponses d'enregistrement simulés (rien n'est écrit) :
//   node web/tests/helpers/shoot-dismiss.mjs [url-de-base] [dossier-de-sortie]
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../../package.json"))("playwright");
const base = process.argv[2] || "http://127.0.0.1:3000";
const out = process.argv[3] || here;

const offers = [
  ["Technicien automobile robotique", "Manpower", "Ruitz (62)"],
  ["Technicien automobile atelier", "Crit", "Lens (62)"],
  ["Technicien carrosserie automobile", "Manpower", "Béthune (62)"],
  ["Technicien informatique", "E.Leclerc", "Bailleul (59)"],
].map(([title, company, location], i) => ({ title, company, location, source: "meteojob", ats: "portals", postedAt: new Date().toISOString(), url: `https://example.org/o/${i}`, fit: { band: "strong", score: 1 } }));
const events = [
  { kind: "atsStart", ats: "portals", companies: 4 },
  ...offers.map((offer) => ({ kind: "offer", offer })),
  { kind: "summary", companiesScanned: 4, unreachable: 0, matches: 4, companiesAvailable: 4, capHit: false },
  { kind: "done", count: 4, offers, cost: { tokens: 0, usd: 0 } },
];

const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark", locale: "fr-FR" })).newPage();
let marks = {};
const calls = [];
const key = (c) => c.toLowerCase();
await page.route("**/api/explore", (r) => (r.request().method() === "POST" ? r.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" }) : r.continue()));
await page.route("**/api/explore/marks", async (r) => {
  if (r.request().method() === "GET") return r.fulfill({ json: { marks } });
  const b = r.request().postDataJSON();
  calls.push({ mark: b.mark, mute: !!b.muteCompany });
  for (const o of b.offers) {
    if (b.mark) marks[`u:${o.url}`] = { mark: b.mark, at: "x" };
    if (b.muteCompany) marks[`c:${key(o.company)}`] = { mark: "dismissed", at: "x" };
  }
  return r.fulfill({ json: { ok: true, marks } });
});
await page.route("**/api/explore/exclude-word", async (r) => {
  calls.push({ word: r.request().postDataJSON().word });
  return r.fulfill({ json: { ok: true, negative: ["stage", "alternance", r.request().postDataJSON().word] } });
});

await page.goto(`${base}/explore?since=30&run=1`, { waitUntil: "domcontentloaded" });
await page.getByText("Technicien informatique", { exact: true }).first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(1200);
const cards = () => page.locator("h3").count();
const dismiss = async (title) => {
  await page.locator("div.co-rise", { hasText: title }).first().getByRole("button", { name: "Pas intéressé" }).click();
  await page.waitForTimeout(500);
};
console.log("cartes :", await cards());

await dismiss("Technicien automobile robotique");
console.log("1 refus → suggestion entreprise :", await page.getByRole("button", { name: /Masquer Manpower/ }).count(), "| mot :", await page.getByRole("button", { name: /Exclure/ }).count());
await dismiss("Technicien automobile atelier");
console.log("2 refus → suggestion mot :", await page.getByRole("button", { name: /Exclure « automobile »/ }).count());
await page.screenshot({ path: path.join(out, "dismiss-suggest.png") });

await page.getByRole("button", { name: /Exclure « automobile »/ }).click();
await page.waitForTimeout(500);
console.log("après exclusion du mot, cartes :", await cards(), "(attendu : 1)");
await page.screenshot({ path: path.join(out, "dismiss-after.png") });
console.log("appels :", JSON.stringify(calls));
await browser.close();
