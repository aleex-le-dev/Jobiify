// Essai du choix de distance (km) et du filtre par contrat, avec un flux simulé :
//   node web/tests/helpers/shoot-distance-contract.mjs [url-de-base] [dossier-de-sortie]
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../../package.json"))("playwright");
const base = process.argv[2] || "http://127.0.0.1:3000";
const out = process.argv[3] || here;

const rows = [
  ["Cariste", "Crit", "Béthune (62)", "INTERIM"], ["Cariste", "Adecco", "Lillers (62)", "INTERIM"], ["Magasinier", "Synergie", "Lens (62)", "INTERIM"],
  ["Technicien informatique", "Leclerc", "Arras (62)", "CDI"], ["Comptable", "Cabinet", "Béthune (62)", "CDI"], ["Agent de production", "Usine", "Lillers (62)", "CDD"],
  ["Plombier CDI", "Bâti", "Lens (62)"], ["Agent administratif", "Mairie", "Arras (62)"],
];
const offers = rows.map(([title, company, location, contract], i) => ({ title, company, location, ...(contract ? { contract } : {}), source: "meteojob", ats: "portals", postedAt: new Date().toISOString(), url: `https://example.org/o/${i}` }));
const events = [
  { kind: "atsStart", ats: "portals", companies: 8 },
  ...offers.map((offer) => ({ kind: "offer", offer })),
  { kind: "summary", companiesScanned: 8, unreachable: 0, matches: offers.length, companiesAvailable: 8, capHit: false },
  { kind: "done", count: offers.length, offers, cost: { tokens: 0, usd: 0 } },
];

const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark", locale: "fr-FR" })).newPage();
const runs = [];
await page.route("**/api/explore", (r) => {
  if (r.request().method() !== "POST") return r.continue();
  runs.push(r.request().postDataJSON().commuteMinutes);
  return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" });
});
await page.route("**/api/explore/marks", (r) => r.fulfill({ json: { marks: {} } }));

await page.goto(`${base}/explore?since=30&run=1`, { waitUntil: "domcontentloaded" });
await page.getByRole("group", { name: "Filtrer par contrat" }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(600);
const chips = () => page.getByRole("group", { name: "Filtrer par contrat" }).getByRole("button").allTextContents();
console.log("contrats :", (await chips()).join(" | "));
await page.screenshot({ path: path.join(out, "distance-contract.png") });

// Filtre par contrat
await page.getByRole("group", { name: "Filtrer par contrat" }).getByRole("button", { name: /^Intérim/ }).click();
console.log("cartes « Intérim » :", await page.locator("h3").count(), "(attendu : 3)");
await page.getByRole("group", { name: "Filtrer par contrat" }).getByRole("button", { name: /Non précisé/ }).click();
console.log("cartes « Non précisé » :", await page.locator("h3").count(), "(attendu : 1 — « Plombier CDI » est déduit du titre, « Agent administratif » n'a rien)");
await page.getByRole("group", { name: "Filtrer par contrat" }).getByRole("button", { name: "Tous" }).click();

// Distance : un clic relance la recherche avec la nouvelle valeur
const dist = page.getByRole("group", { name: "Distance maximale" });
console.log("distances :", (await dist.getByRole("button").allTextContents()).join(" | "));
await dist.getByRole("button", { name: "20 km" }).click();
await page.waitForTimeout(1800);
console.log("recherches lancées (km) :", JSON.stringify(runs), "| 20 km actif :", await dist.getByRole("button", { name: "20 km" }).getAttribute("aria-pressed"));
await page.screenshot({ path: path.join(out, "distance-after.png") });
await browser.close();
