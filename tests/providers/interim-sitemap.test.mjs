// tests/providers/interim-sitemap.test.mjs — offline coverage for the French
// temp-agency sitemap provider (Randstad / Synergie URL shapes observed live
// on 2026-11-11) and its commune resolution against geo.api.gouv.fr data.
import { join } from 'path';
import { pathToFileURL } from 'url';
import { pass, fail, ROOT } from '../helpers.mjs';

console.log('\nProvider — interim-sitemap');

const check = (cond, ok, ko) => (cond ? pass(ok) : fail(ko));

try {
  const mod = await import(pathToFileURL(join(ROOT, 'providers/interim-sitemap.mjs')).href);
  const provider = mod.default;
  const { slugify, titleFromSlug, buildCommuneIndex, resolveCommune, sitemapLocs } = mod;

  check(provider.id === 'interim-sitemap', 'id is "interim-sitemap"', `id=${provider.id}`);
  check(provider.detect({ name: 'x', careers_url: 'https://www.randstad.fr/' }) === null,
    'detect is explicit-only', 'detect claimed an entry without provider: interim-sitemap');
  check(provider.detect({ provider: 'interim-sitemap', interim: { agency: 'nope' } }) === null,
    'detect rejects an unknown agency', 'detect accepted an unknown agency');
  check(provider.detect({ provider: 'interim-sitemap', interim: { agency: 'Randstad' } })?.url
    === 'https://www.randstad.fr/sitemaps/jobs/sitemap-jobdetails.xml',
  'detect resolves a known agency to its fixed sitemap host', 'detect did not resolve randstad');

  check(slugify('Bruay-la-Buissière') === 'bruay-la-buissiere', 'slugify folds accents', `slugify=${slugify('Bruay-la-Buissière')}`);
  check(slugify("Villeneuve-d'Ascq") === 'villeneuve-d-ascq', 'slugify maps apostrophes to dashes', `slugify=${slugify("Villeneuve-d'Ascq")}`);
  check(titleFromSlug('technicien-informatique-fh') === 'Technicien informatique (H/F)',
    'titleFromSlug strips the gender marker and capitalises', `title=${titleFromSlug('technicien-informatique-fh')}`);

  const communes = [
    { nom: 'Lillers', code: '62516', codeDepartement: '62', codesPostaux: ['62190'], population: 10193, centre: { coordinates: [2.4824, 50.5622] } },
    { nom: 'Béthune', code: '62119', codeDepartement: '62', codesPostaux: ['62400'], population: 25000, centre: { coordinates: [2.64, 50.53] } },
    { nom: 'Héricourt', code: '62433', codeDepartement: '62', codesPostaux: ['62130'], population: 70, centre: { coordinates: [2.25, 50.35] } },
  ];
  const index = buildCommuneIndex(communes);

  check(resolveCommune({ title: 'x', citySlug: 'bethune' }, index)?.nom === 'Béthune',
    'slug-only match resolves to the accented commune name', 'bethune not resolved');
  check(resolveCommune({ title: 'x', citySlug: 'hericourt' }, index) === null,
    'slug-only match ignores tiny homonym villages', 'Héricourt (pop 70) was accepted on name alone');
  check(resolveCommune({ title: 'grutier-f-h', citySlug: 'lillers', cp: '62190' }, index)?.nom === 'Lillers',
    'postal code + slug resolves exactly', 'cp 62190 not resolved');
  check(resolveCommune({ title: 'x', citySlug: 'paris', cp: '75001' }, index) === null,
    'a postal code outside the loaded departments is rejected', 'out-of-area postal code accepted');

  const xml = '<?xml version="1.0"?><urlset><url><loc>https://www.randstad.fr/emploi/cariste-fh_bethune_001-nvm-1751202_01c/</loc></url></urlset>';
  const locs = sitemapLocs(xml);
  check(locs.length === 1 && locs[0].includes('cariste-fh_bethune'), 'sitemapLocs reads <loc> entries', `locs=${JSON.stringify(locs)}`);
  check(sitemapLocs('<html>login</html>').length === 0, 'sitemapLocs ignores a non-sitemap body', 'html body yielded locs');

  // End-to-end with a stubbed transport: geo API + one Randstad + one Synergie sitemap.
  const synergieXml = '<urlset><url><loc>https://www.synergie.fr/trouver-un-emploi/technicien-support-f-h-lillers-62190/offre-543-821</loc></url>'
    + '<url><loc>https://www.synergie.fr/trouver-un-emploi/plaquiste-f-h-chateau-guibert-85320/offre-1-2</loc></url></urlset>';
  const ctx = {
    fetchText: async (url) => {
      if (url.startsWith('https://geo.api.gouv.fr/')) return JSON.stringify(url.includes('/62/') ? communes : []);
      if (url.includes('randstad.fr')) return xml;
      if (url.includes('synergie.fr') && url.endsWith('page=1')) return synergieXml;
      throw new Error('404');
    },
  };
  const rjobs = await provider.fetch({ name: 'Randstad', interim: { agency: 'randstad' } }, ctx);
  check(rjobs.length === 1 && rjobs[0].title === 'Cariste (H/F)' && rjobs[0].location.startsWith('Béthune, Pas-de-Calais (62)'),
    'randstad: title + commune parsed from the URL', `randstad jobs=${JSON.stringify(rjobs)}`);
  const sjobs = await provider.fetch({ name: 'Synergie', interim: { agency: 'synergie' } }, ctx);
  check(sjobs.length === 1 && sjobs[0].title === 'Technicien support (H/F)' && sjobs[0].location.startsWith('Lillers'),
    'synergie: keeps the local offer and drops the out-of-area one', `synergie jobs=${JSON.stringify(sjobs)}`);
  const far = await provider.fetch({ name: 'R', interim: { agency: 'randstad', rayon_km: 5 } }, ctx);
  check(far.length === 0, 'rayon_km excludes communes beyond the radius', `far jobs=${JSON.stringify(far)}`);
} catch (err) {
  fail(`interim-sitemap suite threw: ${err.message}`);
}
