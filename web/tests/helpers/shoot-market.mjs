// Capture du panneau « Où sont les offres » : l'analyse est réelle (lecture seule),
// l'ajout au profil est simulé (rien n'est écrit) :
//   node web/tests/helpers/shoot-market.mjs [url-de-base] [dossier-de-sortie]
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../../package.json"))("playwright");
const base = process.argv[2] || "http://127.0.0.1:3000";
const out = process.argv[3] || here;

const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
for (const [name, viewport] of [["market-desktop", { width: 1280, height: 900 }], ["market-mobile", { width: 390, height: 844 }]]) {
  const page = await (await browser.newContext({ viewport, colorScheme: "dark", locale: "fr-FR" })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let posted = null;
  await page.route("**/api/explore/profile-title", (r) => {
    posted = r.request().postDataJSON();
    return r.fulfill({ json: { ok: true, titles: ["Technicien informatique", posted.title], synonyms: ["helpdesk"], added: 1 } });
  });
  // Pas de vraie recherche d'offres : on veut seulement la page et le panneau.
  await page.route("**/api/explore", (r) => (r.request().method() === "POST" ? r.fulfill({ status: 200, contentType: "application/x-ndjson", body: JSON.stringify({ kind: "done", count: 0, offers: [] }) + "\n" }) : r.continue()));
  await page.goto(`${base}/explore?since=30`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Où sont les offres/ }).click({ timeout: 60_000 });
  await page.getByText("offres analysées").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Ajouter « / }).first().click();
  await page.getByText("Métier ajouté").waitFor({ timeout: 10_000 });
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  console.log(name, errors.length ? `erreurs : ${errors.join(" | ")}` : "ok", "| ajout envoyé :", JSON.stringify(posted));
  await page.close();
}
await browser.close();
