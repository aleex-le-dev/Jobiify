// Ajout au suivi d'une offre marquée « Déjà postulé » — partie pure, chargeable par
// `node --test`. L'écriture elle-même passe par les scripts du cœur
// (reserve-report-num, merge-tracker, set-status), jamais par ce module.

import { foldText } from "./offer-match.mjs";

/** Statuts à partir desquels la candidature est déjà partie : on n'y touche plus. */
export const ADVANCED_STATUSES = new Set(["Applied", "Responded", "Assessment", "Interview", "Offer", "Hired", "Rejected"]);

const GENERIC_COMPANY = /^(entreprise|societe|employeur|confidentiel|non communique|agence|pme)/;
const GENDER = /\b(h f|f h|h f x|m f|f m)\b/g;

const roleKey = (s) => foldText(s).replace(GENDER, " ").replace(/\s+/g, " ").trim();

/** URL comparable : sans fragment, sans suivi marketing, sans « / » final. */
export function comparableUrl(raw) {
  const m = String(raw ?? "").match(/https?:\/\/[^\s)|\]]+/i);
  if (!m) return "";
  try {
    const u = new URL(m[0]);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|mtm_|fbclid|gclid|xtor)/i.test(k)) u.searchParams.delete(k);
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return "";
  }
}

/**
 * Ligne du suivi qui correspond déjà à cette offre : même annonce (URL), ou même
 * entreprise ET même poste. Une entreprise inconnue ne fusionne jamais sur le nom.
 * @param {Array<{n: string, company: string, role: string, url?: string, applyLink?: string, status?: string}>} apps
 * @param {{url?: string, company?: string, title?: string}} offer
 */
export function findExistingApplication(apps, offer) {
  const url = comparableUrl(offer.url);
  const company = foldText(offer.company);
  const role = roleKey(offer.title);
  const known = company && !GENERIC_COMPANY.test(company);
  return (
    apps.find((a) => url && (comparableUrl(a.url) === url || comparableUrl(a.applyLink) === url)) ||
    (known && role ? apps.find((a) => foldText(a.company) === company && roleKey(a.role) === role) : undefined)
  );
}

const cell = (v) => String(v ?? "").replace(/[\t\r\n|]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Ajout au suivi : en-tête de colonnes + une ligne, score « N/A » (candidature saisie
 * sans évaluation) et lien de rapport « — » (aucun rapport).
 * @param {{num: string, today: string, company: string, title: string, location?: string, url: string, source?: string}} a
 */
export function appliedTsv({ num, today, company, title, location, url, source }) {
  const generic = !company || GENERIC_COMPANY.test(foldText(company));
  const notes = ["Postulé avant évaluation (marqué depuis la recherche)", source ? `source : ${source}` : "", generic ? "employeur non communiqué" : ""].filter(Boolean).join(" ; ");
  const cols = [
    ["num", num],
    ["date", today],
    ["company", generic ? "?" : cell(company)],
    ["role", cell(title) || "Poste non précisé"],
    ["status", "Applied"],
    ["score", "N/A"],
    ["pdf", "❌"],
    ["report", "—"],
    ["notes", notes],
  ];
  if (cell(location)) cols.push(["location", cell(location)]);
  if (/^https?:\/\//i.test(url) && !/[\t\r\n]/.test(url)) cols.push(["url", url]);
  return `${cols.map((c) => c[0]).join("\t")}\n${cols.map((c) => c[1]).join("\t")}\n`;
}
