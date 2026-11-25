// Essai manuel du panneau « Où sont les offres » pour le profil actif :
//   node --experimental-strip-types tests/helpers/try-market.mjs
import { register } from "node:module";
import "./web-ts-alias-loader.mjs";
register("./extensionless-loader.mjs", import.meta.url);
const { loadMarket } = await import("../../src/lib/core/market.ts");
const t = Date.now();
const m = await loadMarket();
console.log(`${m.profile} — ${m.ville}, ${m.minutes} min — ${m.total} offres en ${Math.round((Date.now() - t) / 1000)} s`);
console.log(`Vos postes visés : ${m.profileMatch.count} offres — ${m.profileMatch.examples.join(" | ")}`);
for (const s of m.sources) console.log(`  ${s.ok ? "ok " : "ERR"} ${s.label}: ${s.count}`);
for (const g of m.metiers) console.log(`${String(g.count).padStart(4)}  ${g.inProfile ? "[profil]" : "        "} ${g.label}  — ${g.examples.join(" | ")}`);
