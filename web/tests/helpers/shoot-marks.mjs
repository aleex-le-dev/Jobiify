// Essai bout en bout des actions d'une carte (Postuler, « Avez-vous postulé ? »,
// Pas intéressé, Remettre dans les nouvelles), avec résultats et enregistrement simulés :
//   node web/tests/helpers/shoot-marks.mjs [url-de-base] [dossier-de-sortie]
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../../package.json"))("playwright");
const base = process.argv[2] || "http://127.0.0.1:3000";
const out = process.argv[3] || here;

const offers = [
  ["Technicien informatique", "E.Leclerc", "Bailleul (59)", "adzuna"],
  ["Technicien support et poste de travail", "Chambres d'Agriculture France", "Arras-Nord", "adzuna"],
  ["Technicien helpdesk N1", "ADECCO", "Lillers (62)", "meteojob"],
].map(([title, company, location, source], i) => ({ title, company, location, source, ats: "portals", postedAt: new Date().toISOString(), url: `https://example.org/offre/${i}`, fit: { band: "strong", score: 1 } }));
const events = [
  { kind: "atsStart", ats: "portals", companies: 3 },
  ...offers.map((offer) => ({ kind: "offer", offer })),
  { kind: "summary", companiesScanned: 3, unreachable: 0, matches: 3, companiesAvailable: 3, capHit: false },
  { kind: "done", count: 3, offers, cost: { tokens: 0, usd: 0 } },
];

const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark", locale: "fr-FR" });
// Les annonces s'ouvrent dans un nouvel onglet : on répond nous-mêmes, sans réseau.
await context.route("https://example.org/**", (r) => r.fulfill({ contentType: "text/html", body: "<h1>Annonce</h1>" }));
const page = await context.newPage();
let marks = {};
const posts = [];
await page.route("**/api/explore", (r) => (r.request().method() === "POST" ? r.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" }) : r.continue()));
await page.route("**/api/explore/marks", async (r) => {
  if (r.request().method() === "GET") return r.fulfill({ json: { marks } });
  const body = r.request().postDataJSON();
  posts.push(body.mark);
  for (const o of body.offers) {
    if (body.mark) marks[`u:${o.url}`] = { mark: body.mark, at: new Date().toISOString() };
    else delete marks[`u:${o.url}`];
  }
  return r.fulfill({ json: { ok: true, marks, ...(body.mark === "applied" ? { tracked: { added: body.offers.length, updated: 0, already: 0, failed: 0 } } : {}) } });
});

await page.goto(`${base}/explore?since=30&run=1`, { waitUntil: "domcontentloaded" });
await page.getByText("Technicien informatique", { exact: true }).first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(1200);
const cards = () => page.locator("h3").count();
const card = (title) => page.locator("div.co-rise", { hasText: title }).first();
console.log("cartes au départ :", await cards());
await page.screenshot({ path: path.join(out, "card-default.png") });

// 1) Postuler : l'annonce s'ouvre, la carte demande « Avez-vous postulé ? »
const popup = context.waitForEvent("page");
await card("Technicien informatique").getByRole("link", { name: /Postuler/ }).click();
await (await popup).close();
await page.bringToFront();
console.log("question affichée :", await page.getByText("Avez-vous postulé ?").count());
await page.screenshot({ path: path.join(out, "card-ask.png") });

// 2) Oui → classée « Déjà postulé » et ajoutée au suivi
await page.getByRole("button", { name: /Oui, j'ai postulé/ }).click();
await page.waitForTimeout(600);
console.log("cartes après « Oui » :", await cards(), "| message suivi :", await page.getByText(/ajoutée? à Mes candidatures/).count());

// 3) « Pas encore » ne classe rien
const popup2 = context.waitForEvent("page");
await card("Technicien helpdesk").getByRole("link", { name: /Postuler/ }).click();
await (await popup2).close();
await page.bringToFront();
await page.getByRole("button", { name: "Pas encore" }).click();
console.log("après « Pas encore » : cartes", await cards(), "| question :", await page.getByText("Avez-vous postulé ?").count());

// 4) Pas intéressé en un clic, puis remise dans les nouvelles depuis l'onglet
await card("Technicien support").getByRole("button", { name: "Pas intéressé" }).click();
await page.waitForTimeout(400);
console.log("cartes après « Pas intéressé » :", await cards());
await page.getByRole("button", { name: /Pas intéressé \d/ }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Remettre dans les nouvelles" }).first().click();
await page.waitForTimeout(500);
console.log("après remise :", await cards(), "| requêtes :", JSON.stringify(posts));

// 5) Le menu « Autres actions »
await card("Technicien helpdesk").getByRole("button", { name: "Autres actions" }).click();
console.log("menu :", await page.getByRole("menuitem").allTextContents());
await page.screenshot({ path: path.join(out, "card-menu.png") });
await browser.close();
