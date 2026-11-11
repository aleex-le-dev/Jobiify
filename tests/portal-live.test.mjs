// tests/portal-live.test.mjs — fetchLive() interroge chaque entrée active via son
// provider, ne déduplique que par URL, n'écrit rien et isole les pannes.
import { join } from 'path';
import { pathToFileURL } from 'url';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\nportal-live — interrogation en direct de portals.yml');

const check = (cond, ok, ko) => (cond ? pass(ok) : fail(ko));

try {
  const { fetchLive } = await import(pathToFileURL(join(ROOT, 'portal-live.mjs')).href);

  const providers = new Map([
    ['ok', { id: 'ok', fetch: async (e) => [
      { title: 'Technicien support (H/F)', url: `https://x.test/${e.name}/1`, location: 'Béthune', postedAt: Date.UTC(2026, 10, 1) },
      { title: 'Doublon', url: 'https://x.test/shared' },
      { title: '', url: 'https://x.test/sans-titre' },
    ] }],
    ['boom', { id: 'boom', fetch: async () => { throw new Error('HTTP 503'); } }],
    ['local-parser', { id: 'local-parser', fetch: async () => { throw new Error('ne doit jamais tourner'); } }],
  ]);

  const { offers, errors } = await fetchLive([
    { name: 'A', provider: 'ok' },
    { name: 'B', provider: 'ok' },
    { name: 'Off', provider: 'ok', enabled: false },
    { name: 'Panne', provider: 'boom' },
    { name: 'Local', provider: 'local-parser' },
  ], { providers, httpCtx: {}, concurrency: 2 });

  check(offers.length === 3, 'garde une offre par URL et ignore les entrées désactivées', `offers=${JSON.stringify(offers)}`);
  check(offers.every((o) => o.title && o.url && o.company), 'chaque offre a titre, URL et entreprise', 'champ manquant');
  check(offers.some((o) => o.postedAt === '2026-11-01T00:00:00.000Z'), 'postedAt numérique converti en ISO', 'postedAt non converti');
  check(offers.some((o) => o.company === 'A' && o.source === 'ok'), "l'entreprise par défaut est le nom de l'entrée", 'company/source incorrects');
  check(errors.some((e) => e.name === 'Panne' && /503/.test(e.error)), "une panne est signalée sans bloquer les autres", `errors=${JSON.stringify(errors)}`);
  check(errors.some((e) => e.name === 'Local'), 'local-parser n\'est jamais exécuté', 'local-parser exécuté');
} catch (err) {
  fail(`portal-live suite threw: ${err.message}`);
}
