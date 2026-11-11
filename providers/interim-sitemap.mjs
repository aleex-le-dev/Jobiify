// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Agences d'intérim françaises via leur sitemap public d'offres (zéro auth,
// autorisé par leur robots.txt). Le titre et la commune sont reconstruits à
// partir de l'URL de l'offre, puis la commune est résolue sur la base officielle
// geo.api.gouv.fr (départements configurés) pour ne garder que les offres
// situées dans un rayon autour du point d'origine.
//
//   job_boards:
//     - name: Randstad (intérim)
//       provider: interim-sitemap
//       interim:
//         agency: randstad          # randstad | synergie
//         departements: ["62", "59"]
//         origin: { lat: 50.5489, lon: 2.412 }   # Lières
//         rayon_km: 50
//
// Les hôtes sont figés par agence (aucune URL venant de la config n'est
// requêtée), ce qui garde la surface réseau fermée.

import { fetchTextWithRetry } from './_http.mjs';

/** @type {Record<string, {label: string, host: string, sitemaps: string[], parse: (path: string) => {title: string, citySlug: string, cp?: string}|null}>} */
const AGENCIES = {
  randstad: {
    label: 'Randstad',
    host: 'www.randstad.fr',
    sitemaps: [
      'https://www.randstad.fr/sitemaps/jobs/sitemap-jobdetails.xml',
      'https://www.randstad.fr/sitemaps/jobs/sitemap-jobdetails-2.xml',
    ],
    // /emploi/{titre-fh}_{commune}_{référence}/
    parse(path) {
      const m = path.match(/^\/emploi\/([a-z0-9-]+)_([a-z0-9-]+)_[a-z0-9_-]+\/?$/i);
      return m ? { title: m[1], citySlug: m[2].toLowerCase() } : null;
    },
  },
  synergie: {
    label: 'Synergie',
    host: 'www.synergie.fr',
    sitemaps: [1, 2, 3, 4, 5, 6, 7, 8].map((p) => `https://www.synergie.fr/sitemaps/jobs/sitemap.xml?page=${p}`),
    // /trouver-un-emploi/{titre-f-h}-{commune}-{cp}/offre-NNN-NNN
    parse(path) {
      const m = path.match(/^\/trouver-un-emploi\/([a-z0-9-]+)-(\d{5})\/offre-[\d-]+\/?$/i);
      if (!m) return null;
      const body = m[1].toLowerCase();
      const marker = body.match(/^(.*?-(?:f-h|h-f|h-f-x|f-h-x))-(.+)$/);
      return marker
        ? { title: marker[1], citySlug: marker[2], cp: m[2] }
        : { title: body, citySlug: '', cp: m[2] };
    },
  },
};

/** @param {string} s */
export function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** @param {string} slug */
export function titleFromSlug(slug) {
  const words = slug.replace(/-(?:f-?h|h-?f)(?:-x)?$/i, '').split('-').filter(Boolean);
  const t = words.join(' ');
  return t ? `${t[0].toUpperCase()}${t.slice(1)} (H/F)` : '';
}

/** Distance à vol d'oiseau en km. */
function haversine(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const MIN_POPULATION_SLUG_ONLY = 1500;

const DEPT_NAMES = { '59': 'Nord', '62': 'Pas-de-Calais', '80': 'Somme', '02': 'Aisne', '60': 'Oise' };

/**
 * Index des communes : slug → commune, et code postal → communes.
 * @param {any[]} communes - réponse geo.api.gouv.fr (nom, code, centre, codesPostaux, codeDepartement)
 */
export function buildCommuneIndex(communes) {
  const bySlug = new Map();
  const byCp = new Map();
  for (const c of communes) {
    if (!c?.nom || !c?.centre?.coordinates) continue;
    const entry = {
      nom: c.nom,
      dept: c.codeDepartement || String(c.code || '').slice(0, 2),
      lat: c.centre.coordinates[1],
      lon: c.centre.coordinates[0],
      population: Number(c.population) || 0,
    };
    const slug = slugify(c.nom);
    if (!bySlug.has(slug)) bySlug.set(slug, entry);
    for (const cp of c.codesPostaux || []) {
      if (!byCp.has(cp)) byCp.set(cp, []);
      byCp.get(cp).push({ ...entry, slug });
    }
  }
  return { bySlug, byCp };
}

/**
 * @param {{title: string, citySlug: string, cp?: string}} parsed
 * @param {ReturnType<typeof buildCommuneIndex>} index
 */
export function resolveCommune(parsed, index) {
  if (parsed.cp) {
    const candidates = index.byCp.get(parsed.cp) || [];
    if (candidates.length === 0) return null;
    const exact = candidates.find((c) => c.slug === parsed.citySlug)
      || candidates.find((c) => parsed.citySlug.endsWith(c.slug) || `${parsed.title}-${parsed.citySlug}`.endsWith(c.slug));
    return exact || candidates[0];
  }
  // Sans code postal, un nom de commune peut être un homonyme hors région
  // (Héricourt 62 vs Héricourt 70) : on n'accepte que les communes assez
  // peuplées pour accueillir une agence ou un site client.
  const c = index.bySlug.get(parsed.citySlug);
  return c && c.population >= MIN_POPULATION_SLUG_ONLY ? c : null;
}

/** @param {string} xml */
export function sitemapLocs(xml) {
  if (typeof xml !== 'string' || !/<urlset\b/i.test(xml)) return [];
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
}

/** @param {any} entry */
function parseConfig(entry) {
  const cfg = entry?.interim || {};
  const agency = AGENCIES[String(cfg.agency || '').toLowerCase()];
  const departements = (Array.isArray(cfg.departements) ? cfg.departements : ['62', '59'])
    .map(String).filter((d) => /^\d{2}$/.test(d)).slice(0, 5);
  const lat = Number(cfg.origin?.lat), lon = Number(cfg.origin?.lon);
  const rayon = Number(cfg.rayon_km);
  return {
    agency,
    departements,
    origin: Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : { lat: 50.5489, lon: 2.412 },
    rayonKm: Number.isFinite(rayon) && rayon > 0 ? Math.min(rayon, 150) : 50,
  };
}

/** @type {Provider} */
export default {
  id: 'interim-sitemap',

  detect(entry) {
    if (entry?.provider !== 'interim-sitemap') return null;
    const { agency } = parseConfig(entry);
    return agency ? { url: agency.sitemaps[0] } : null;
  },

  async fetch(entry, ctx) {
    const { agency, departements, origin, rayonKm } = parseConfig(entry);
    if (!agency) {
      throw new Error(`interim-sitemap: "${entry?.name || '(sans nom)'}" doit définir interim.agency (${Object.keys(AGENCIES).join(' | ')})`);
    }

    const communes = [];
    for (const d of departements) {
      const raw = await fetchTextWithRetry(ctx,
        `https://geo.api.gouv.fr/departements/${d}/communes?fields=nom,code,centre,codesPostaux,codeDepartement,population`,
        { redirect: 'error', timeoutMs: 20_000 });
      try { communes.push(...JSON.parse(raw)); } catch { /* département ignoré */ }
    }
    if (communes.length === 0) throw new Error('interim-sitemap: référentiel des communes indisponible (geo.api.gouv.fr)');
    const index = buildCommuneIndex(communes);

    const probing = Number.isInteger(ctx?.maxPages) && ctx.maxPages > 0;
    const sitemaps = probing ? agency.sitemaps.slice(0, 1) : agency.sitemaps;
    const jobs = [];
    const seen = new Set();
    let read = 0;
    for (const sm of sitemaps) {
      let xml;
      try {
        xml = await fetchTextWithRetry(ctx, sm, { redirect: 'error', timeoutMs: 30_000 });
      } catch (err) {
        if (read === 0 && sm === sitemaps[0]) throw err;
        continue; // page suivante absente : fin de pagination
      }
      const locs = sitemapLocs(xml);
      if (locs.length === 0) continue;
      read++;
      for (const loc of locs) {
        let url;
        try { url = new URL(loc); } catch { continue; }
        if (url.hostname !== agency.host || seen.has(url.pathname)) continue;
        const parsed = agency.parse(url.pathname);
        if (!parsed) continue;
        const commune = resolveCommune(parsed, index);
        if (!commune || haversine(origin, commune) > rayonKm) continue;
        const title = titleFromSlug(parsed.title);
        if (!title) continue;
        seen.add(url.pathname);
        jobs.push({
          title,
          url: url.href,
          company: agency.label,
          location: `${commune.nom}, ${DEPT_NAMES[commune.dept] || commune.dept} (${commune.dept}), France`,
        });
      }
    }
    if (read === 0) throw new Error(`interim-sitemap: aucun sitemap ${agency.label} lisible`);
    return jobs;
  },
};
