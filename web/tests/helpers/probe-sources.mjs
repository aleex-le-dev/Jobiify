// Essai manuel des sources sans clé pour le profil actif (aucune écriture hors cache) :
//   node --experimental-strip-types tests/helpers/probe-sources.mjs [source...]
// Sources : meteojob, service-public, interim. Sans argument : meteojob + service-public.
import { register } from "node:module";
import "./web-ts-alias-loader.mjs";

register("./extensionless-loader.mjs", import.meta.url);

const { getActiveProfile, filtersFromProfile } = await import("../../src/lib/core/search-profiles.ts");
const { loadZone } = await import("../../src/lib/core/zone.ts");
const { buildSearchContext } = await import("../../src/lib/core/search-context.ts");

const profile = getActiveProfile();
if (!profile) {
  console.log("Aucun profil actif.");
  process.exit(0);
}
const filters = filtersFromProfile(profile);
const zone = filters.commuteMinutes ? await loadZone(filters.commuteMinutes, filters.originCity, filters.originInsee) : undefined;
const ctx = await buildSearchContext(filters, zone);
console.log(`Profil « ${profile.name} » — ${ctx.nom} (${ctx.codePostal || "?"}), ${ctx.radiusKm} km, départements ${ctx.departements.join(", ")}`);
console.log(`Villes d'ancrage : ${ctx.anchors.join(", ")}`);
console.log(`${filters.positive.length} mots-clés, exclus : ${filters.negative.join(", ")}`);

const wanted = process.argv.slice(2);
const want = (id) => (wanted.length ? wanted.includes(id) : id !== "interim");
const show = (label, offers) => {
  console.log(`\n${label} : ${offers.length} offre(s)`);
  for (const o of offers.slice(0, 12)) console.log(`  - ${o.title} | ${o.company} | ${o.location} | ${String(o.postedAt).slice(0, 10)}${o.note ? ` | ${o.note}` : ""}`);
};

if (want("meteojob")) {
  const { loadMeteojobDiscoveredOffers } = await import("../../src/lib/core/meteojob.ts");
  show("Meteojob", await loadMeteojobDiscoveredOffers(filters, profile.titles, zone, ctx));
}
if (want("service-public")) {
  const { loadServicePublicDiscoveredOffers } = await import("../../src/lib/core/service-public.ts");
  show("Fonction publique", await loadServicePublicDiscoveredOffers(filters, profile.titles, zone, ctx));
}
if (want("interim")) {
  const { loadInterimOffers } = await import("../../src/lib/core/interim.ts");
  const { offers, sources } = await loadInterimOffers();
  console.log(`\nIntérim : ${offers.length} mission(s)`);
  for (const s of sources) console.log(`  ${s.label} : ${s.status} (${s.count})`);
}
