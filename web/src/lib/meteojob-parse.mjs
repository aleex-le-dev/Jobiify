// Lecture d'une page de résultats Meteojob — pur, sans dépendance, chargeable par
// `node --test`. La page embarque ses résultats dans un bloc JSON d'état
// (<script id="candidate-front-state">) ; on n'analyse jamais le HTML affiché.

/**
 * @typedef {Object} MeteojobRawJob
 * @property {string} id
 * @property {string} title
 * @property {string} company
 * @property {string} locality  Ville et département, ex. « Béthune (62) »
 * @property {number} [lat]
 * @property {number} [lon]
 * @property {string} publicationDate
 * @property {string[]} contracts  Codes Meteojob : CDI, CDD, INTERIM…
 */

/**
 * @param {string} html
 * @returns {{ total: number, jobs: MeteojobRawJob[] }}
 */
export function parseMeteojobPage(html) {
  const m = String(html ?? "").match(/<script id="candidate-front-state" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return { total: 0, jobs: [] };
  let state;
  try {
    state = JSON.parse(m[1]);
  } catch {
    return { total: 0, jobs: [] };
  }
  const block = state && typeof state === "object" ? state["app:search:offers"] : null;
  const content = Array.isArray(block?.content) ? block.content : [];
  /** @type {MeteojobRawJob[]} */
  const jobs = [];
  for (const o of content) {
    const id = String(o?.id ?? "").trim();
    const title = String(o?.title ?? "").trim();
    if (!id || !title) continue;
    const place = Array.isArray(o.locations) ? o.locations[0] : null;
    jobs.push({
      id,
      title,
      company: String(o.company?.name || o.recruiter || "").trim(),
      // « Béthune (62) - Hauts-de-France » → « Béthune (62) »
      locality: String(o.locality || place?.name || "").split(" - ")[0].trim(),
      lat: typeof place?.lat === "number" ? place.lat : undefined,
      lon: typeof place?.lon === "number" ? place.lon : undefined,
      publicationDate: String(o.publicationDate || o.lastModification || ""),
      contracts: Array.isArray(o.contractTypes) ? o.contractTypes.filter((c) => typeof c === "string") : [],
    });
  }
  return { total: Number(block?.total) || jobs.length, jobs };
}
