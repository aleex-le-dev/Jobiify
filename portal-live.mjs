#!/usr/bin/env node

/**
 * portal-live.mjs — interroge EN DIRECT tous les portails de portals.yml
 * (tracked_companies + job_boards) via la même couche de providers que scan.mjs,
 * et imprime TOUTES les offres actuelles en JSON sur stdout.
 *
 * Différences avec scan.mjs, voulues pour l'Explorer web :
 *   - aucune écriture (ni pipeline.md, ni scan-history.tsv) ;
 *   - aucune déduplication contre l'historique : une offre déjà vue reste visible ;
 *   - aucun filtre titre/lieu : l'appelant applique les filtres du profil et la
 *     zone de trajet (une seule règle côté web, voir web/src/lib/core/zone.ts).
 *
 * `local-parser` est ignoré (comme audit-portals.mjs) : ce script ne lance
 * jamais de commande configurée dans un fichier portals.
 *
 * Usage :
 *   node portal-live.mjs                 # portals.yml de la racine de données
 *   node portal-live.mjs --portals f.yml # autre fichier
 *   node portal-live.mjs --concurrency 6
 *
 * Sortie : {"version":"jobiify.portal-live@1","offers":[{company,title,url,location,postedAt,source}],"errors":[{name,error}]}
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

import { makeHttpCtx } from './providers/_http.mjs';
import { loadProviders, resolveProvider } from './providers/_registry.mjs';
import { flagValue, hasFlag, validateFlags } from './lib/cli-flags.mjs';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';

const CODE_ROOT = dirname(fileURLToPath(import.meta.url));
const PROVIDERS_DIR = join(CODE_ROOT, 'providers');

/** @param {unknown} v */
function iso(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString();
  if (typeof v === 'string' && v.trim()) return v.trim();
  return '';
}

/**
 * Récupère les offres de chaque entrée active.
 * @param {object[]} entries
 * @param {{providers: Map, httpCtx?: object, concurrency?: number}} deps
 */
export async function fetchLive(entries, { providers, httpCtx = null, concurrency = 6 }) {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e === 'object' && e.enabled !== false);
  const offers = [];
  const errors = [];
  const seen = new Set();
  const queue = [...list];

  const worker = async () => {
    while (queue.length > 0) {
      const entry = queue.shift();
      const name = typeof entry.name === 'string' ? entry.name : '(sans nom)';
      const resolved = resolveProvider(entry, providers, { skipIds: ['local-parser'] });
      if (!resolved?.provider) {
        errors.push({ name, error: resolved?.error || 'aucun provider ne gère cette entrée' });
        continue;
      }
      try {
        const jobs = (await resolved.provider.fetch(entry, httpCtx || makeHttpCtx())) || [];
        for (const j of jobs) {
          const url = typeof j?.url === 'string' ? j.url.trim() : '';
          const title = typeof j?.title === 'string' ? j.title.trim() : '';
          if (!url || !title || seen.has(url)) continue;
          seen.add(url);
          offers.push({
            company: (typeof j.company === 'string' && j.company.trim()) || name,
            title,
            url,
            location: typeof j.location === 'string' ? j.location : '',
            postedAt: iso(j.postedAt),
            source: resolved.provider.id,
          });
        }
      } catch (err) {
        errors.push({ name, error: err?.message || String(err) });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { offers, errors };
}

async function main() {
  const args = process.argv.slice(2);
  validateFlags(args, ['--portals', '--concurrency', '--help', '-h'],
    'Usage: node portal-live.mjs [--portals <file>] [--concurrency <n>]',
    { valueFlags: ['--portals', '--concurrency'] });
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log('Usage: node portal-live.mjs [--portals <file>] [--concurrency <n>]\nPrints every live posting of portals.yml as JSON (no writes, no dedup, no filters).');
    return;
  }
  const portalsPath = flagValue(args, '--portals') || process.env.CAREER_OPS_PORTALS || join(getCareerOpsRoot(), 'portals.yml');
  if (!existsSync(portalsPath)) {
    process.stdout.write(`${JSON.stringify({ version: 'jobiify.portal-live@1', offers: [], errors: [{ name: 'portals.yml', error: 'introuvable' }] })}\n`);
    return;
  }
  const doc = yaml.load(readFileSync(portalsPath, 'utf8')) || {};
  const entries = [
    ...(Array.isArray(doc.tracked_companies) ? doc.tracked_companies : []),
    ...(Array.isArray(doc.job_boards) ? doc.job_boards : []),
  ];
  const concurrency = Math.min(12, Math.max(1, Number(flagValue(args, '--concurrency')) || 6));
  const providers = await loadProviders(PROVIDERS_DIR);
  const { offers, errors } = await fetchLive(entries, { providers, concurrency });
  process.stdout.write(`${JSON.stringify({ version: 'jobiify.portal-live@1', offers, errors })}\n`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(`portal-live: ${err?.message || err}`);
    process.exitCode = 1;
  });
}
