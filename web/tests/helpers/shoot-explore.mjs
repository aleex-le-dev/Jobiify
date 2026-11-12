// Capture d'écran de la page de recherche avec un flux de résultats simulé
// (aucune vraie recherche n'est lancée) :
//   node web/tests/helpers/shoot-explore.mjs [url-de-base] [dossier-de-sortie]
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../../package.json"));
const { chromium } = require("playwright");

const base = process.argv[2] || "http://127.0.0.1:3000";
const out = process.argv[3] || here;
const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

const offers = [
  { title: "TECHNICIEN INFORMATIQUE H/F", company: "Crit", location: "Béthune (62)", postedAt: day(0), source: "france-travail", note: "Intérim", fit: { band: "strong", score: 1 } },
  { title: "Technicien support utilisateurs", company: "Centre hospitalier de Béthune", location: "Beuvry (62)", postedAt: day(1), source: "service-public-62", fit: { band: "related", score: 0.5 } },
  { title: "Technicien helpdesk N1 (H/F)", company: "ADECCO", location: "Lillers (62)", postedAt: day(1), source: "meteojob", note: "Intérim", fit: { band: "strong", score: 0.67 } },
  { title: "Opérateur d'exploitation informatique", company: "Roquette Frères", location: "Lestrem (62)", postedAt: day(2), source: "france-travail", note: "Même métier : Production et exploitation de systèmes d'information · CDI", fit: { band: "weak", score: 0.3 } },
  { title: "Administrateur systèmes et réseaux", company: "Communauté de communes du Ternois", location: "Herlin-le-Sec (62130)", postedAt: day(3), source: "service-public-62", fit: { band: "related", score: 0.5 } },
  { title: "Technicien de proximité", company: "Boulanger", location: "Lesquin (59)", postedAt: day(4), source: "portal-smartrecruiters", fit: { band: "strong", score: 1 } },
  { title: "Technicien de maintenance informatique F/H", company: "SYNERGIE", location: "Bruay-la-Buissière (62)", postedAt: day(5), source: "interim-meteojob", note: "Intérim via Synergie", fit: { band: "strong", score: 1 } },
  { title: "Gestionnaire de parc informatique", company: "Département du Pas-de-Calais", location: "Arras (62)", postedAt: day(6), source: "service-public-62", fit: { band: "strong", score: 1 } },
].map((o, i) => ({ ...o, ats: "portals", url: `https://example.org/offre/${i}`, matchedKeyword: "technicien informatique" }));

const reports = [
  { id: "portails", label: "Employeurs suivis", status: "ok", found: 1, kept: 1 },
  { id: "france-travail", label: "France Travail", status: process.env.FT_OK ? "ok" : "needs-key", found: process.env.FT_OK ? 9 : 0, kept: process.env.FT_OK ? 2 : 0 },
  { id: "meteojob", label: "Meteojob", status: "ok", found: 3, kept: 1 },
  { id: "jooble", label: "Jooble", status: "needs-key", found: 0, kept: 0 },
  { id: "adzuna", label: "Adzuna", status: "needs-key", found: 0, kept: 0 },
  { id: "careerjet", label: "Careerjet", status: "needs-key", found: 0, kept: 0 },
  { id: "wttj", label: "Welcome to the Jungle", status: "empty", found: 0, kept: 0 },
  { id: "service-public", label: "Fonction publique", status: "ok", found: 3, kept: 3 },
  { id: "interim", label: "Missions d'intérim", status: "ok", found: 4, kept: 1 },
];

const events = [
  { kind: "start", ats: ["portals"], sinceDays: 14, limit: 150, free: true },
  { kind: "atsStart", ats: "portals", companies: 34 },
  ...offers.map((offer) => ({ kind: "offer", offer })),
  ...reports.map((r) => ({ kind: "source", ...r })),
  { kind: "atsDone", ats: "portals", unreachable: 0 },
  { kind: "summary", companiesScanned: 34, unreachable: 0, matches: offers.length, companiesAvailable: 34, capHit: false },
  { kind: "done", count: offers.length, offers, cost: { tokens: 0, usd: 0 } },
];

// Navigateur Playwright s'il est installé, sinon Chrome puis Edge.
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" })).catch(() => chromium.launch({ channel: "msedge" }));
for (const [name, viewport, scheme] of [
  ["explore-desktop", { width: 1440, height: 1000 }, "light"],
  ["explore-desktop-dark", { width: 1440, height: 1000 }, "dark"],
  ["explore-mobile", { width: 390, height: 844 }, "light"],
]) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, locale: "fr-FR" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.route("**/api/explore", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 200, contentType: "application/x-ndjson; charset=utf-8", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" })
      : route.continue(),
  );
  await page.goto(`${base}/explore?since=30&run=1`, { waitUntil: "domcontentloaded" });
  await page.getByText("source", { exact: false }).first().waitFor({ timeout: 60_000 }).catch(() => {});
  await page.getByRole("button", { name: /Voir le détail/ }).click({ timeout: 15_000 }).catch((e) => errors.push(`détail: ${e.message.split("\n")[0]}`));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
  console.log(name, errors.length ? `— erreurs : ${[...new Set(errors)].slice(0, 5).join(" | ")}` : "— ok");
  await ctx.close();
}
await browser.close();
