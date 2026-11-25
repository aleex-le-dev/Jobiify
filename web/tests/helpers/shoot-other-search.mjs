// Essai « Chercher un autre métier » depuis l'accueil ; la recherche elle-même est simulée,
// on lit seulement les filtres envoyés :
//   node web/tests/helpers/shoot-other-search.mjs [url-de-base] [dossier-de-sortie]
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../../package.json"))("playwright");
const base = process.argv[2] || "http://127.0.0.1:3000";
const out = process.argv[3] || here;

const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark", locale: "fr-FR" })).newPage();
let sent = null;
await page.route("**/api/explore", (r) => {
  if (r.request().method() !== "POST") return r.continue();
  sent = r.request().postDataJSON();
  return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ kind: "done", count: 0, offers: [] }) + "\n" });
});

await page.goto(base, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /Chercher un autre métier/ }).click({ timeout: 60_000 });
await page.screenshot({ path: path.join(out, "other-search-open.png") });
await page.getByLabel("Métier recherché").fill("cariste");
await page.getByRole("button", { name: "Chercher", exact: true }).click();
await page.waitForURL(/\/explore\?metier=cariste/, { timeout: 30_000 });
await page.getByText("Affiner la recherche").waitFor({ timeout: 60_000 });
await page.waitForTimeout(1500);
console.log("url :", page.url());
console.log("poste affiché :", await page.getByText("cariste", { exact: true }).count(), "| retour profil :", await page.getByText("Revenir à mon profil").count());
console.log("filtres envoyés :", JSON.stringify({ positive: sent?.positive?.slice(0, 6), nbPositive: sent?.positive?.length, negative: sent?.negative, commuteMinutes: sent?.commuteMinutes, originCity: sent?.originCity }));
await page.screenshot({ path: path.join(out, "other-search-explore.png") });
await browser.close();
