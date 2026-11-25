// Captures de l'en-tête de l'accueil (bureau, tablette, mobile), formulaire fermé puis ouvert :
//   node web/tests/helpers/shoot-home.mjs [url-de-base] [dossier-de-sortie]
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../../package.json"))("playwright");
const base = process.argv[2] || "http://127.0.0.1:3000";
const out = process.argv[3] || here;

const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
for (const [name, viewport] of [["home-desktop", { width: 1280, height: 520 }], ["home-tablet", { width: 820, height: 560 }], ["home-mobile", { width: 390, height: 700 }]]) {
  const page = await (await browser.newContext({ viewport, colorScheme: "dark", locale: "fr-FR" })).newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /autre métier/i }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.getByRole("button", { name: /autre métier/i }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, `${name}-open.png`) });
  console.log(name, "| champ actif :", await page.evaluate(() => document.activeElement?.id));
  await page.close();
}
await browser.close();
