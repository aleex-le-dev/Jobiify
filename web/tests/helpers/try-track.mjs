// Essai de l'ajout au suivi sur un dossier de données jetable (CAREER_OPS_ROOT) :
//   CAREER_OPS_ROOT=<dossier> node --experimental-strip-types tests/helpers/try-track.mjs
import { register } from "node:module";
import "./web-ts-alias-loader.mjs";
register("./extensionless-loader.mjs", import.meta.url);
const { trackApplied } = await import("../../src/lib/core/tracker-applied.ts");
const offer = { url: "https://crit.example/o/1?utm_source=x", title: "Technicien réseau (H/F)", company: "Crit", location: "Béthune (62)", source: "meteojob" };
console.log("1er ajout   :", JSON.stringify(await trackApplied(offer)));
console.log("même offre  :", JSON.stringify(await trackApplied({ ...offer, url: "https://autre.example/zz" })));
console.log("sans employeur:", JSON.stringify(await trackApplied({ url: "https://x.example/9", title: "Cariste", company: "Entreprise non communiquée", location: "Lens" })));
