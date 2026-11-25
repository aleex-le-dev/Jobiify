// Essai de l'interface « Tous les métiers de ma zone » avec un flux de résultats simulé
// (aucune vraie recherche) :
//   node web/tests/helpers/shoot-all-metiers.mjs [url-de-base] [dossier-de-sortie]
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../../package.json"))("playwright");
const base = process.argv[2] || "http://127.0.0.1:3000";
const out = process.argv[3] || here;

const titles = [
  ...Array.from({ length: 6 }, (_, i) => ["Cariste H/F", `Crit ${i}`, "Béthune (62)"]),
  ...Array.from({ length: 5 }, (_, i) => ["Agent de production", `Usine ${i}`, "Lillers (62)"]),
  ...Array.from({ length: 4 }, (_, i) => ["Maçon", `Bâti ${i}`, "Lens (62)"]),
  ...Array.from({ length: 3 }, (_, i) => ["Technicien informatique", `IT ${i}`, "Arras (62)"]),
  ...Array.from({ length: 2 }, (_, i) => ["Comptable", `Cabinet ${i}`, "Béthune (62)"]),
];
const offers = titles.map(([title, company, location], i) => ({ title, company, location, source: i % 2 ? "meteojob" : "service-public-62", ats: "portals", postedAt: new Date().toISOString(), url: `https://example.org/o/${i}` }));
const events = [
  { kind: "atsStart", ats: "portals", companies: 9 },
  ...offers.map((offer) => ({ kind: "offer", offer })),
  { kind: "summary", companiesScanned: 9, unreachable: 0, matches: offers.length, companiesAvailable: 9, capHit: false },
  { kind: "done", count: offers.length, offers, cost: { tokens: 0, usd: 0 } },
];

const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark", locale: "fr-FR" })).newPage();
let sent = null;
await page.route("**/api/explore", (r) => {
  if (r.request().method() !== "POST") return r.continue();
  sent = r.request().postDataJSON();
  return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" });
});
await page.route("**/api/explore/marks", (r) => r.fulfill({ json: { marks: {} } }));

// 1) Depuis l'accueil
await page.goto(base, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /autre métier/i }).click({ timeout: 60_000 });
await page.getByRole("link", { name: /voir tous les métiers de ma zone/i }).click();
await page.waitForURL(/\/explore\?.*all=1/, { timeout: 30_000 });
await page.getByRole("group", { name: "Filtrer par métier" }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(800);
console.log("filtres envoyés : allMetiers =", sent?.allMetiers, "| commute =", sent?.commuteMinutes, "| exclus =", JSON.stringify(sent?.negative));
console.log("pastille :", await page.getByText("Tous les métiers", { exact: true }).count(), "| revenir au profil :", await page.getByText("Revenir à mon profil").count());
const chips = await page.getByRole("group", { name: "Filtrer par métier" }).getByRole("button").allTextContents();
console.log("métiers :", chips.join(" | "));
await page.screenshot({ path: path.join(out, "all-metiers.png") });

// 2) Parcourir un métier
await page.getByRole("group", { name: "Filtrer par métier" }).getByRole("button", { name: /Maçon|Gros œuvre/ }).click();
await page.waitForTimeout(300);
console.log("cartes après filtre métier :", await page.locator("h3").count(), "(attendu : 4)");

// 3) Case à cocher dans « Affiner la recherche »
await page.getByRole("button", { name: /Affiner la recherche/ }).click();
console.log("case présente :", await page.getByLabel(/Tous les métiers de ma zone/).count(), "| cochée :", await page.getByLabel(/Tous les métiers de ma zone/).isChecked());
await browser.close();
