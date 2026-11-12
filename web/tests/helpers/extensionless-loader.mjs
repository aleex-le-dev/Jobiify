// Hook de résolution pour les essais manuels : suit les imports relatifs sans
// extension (« ./zone ») que seul le bundler comprend nativement.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (/^\.{1,2}\//.test(specifier) && !/\.[a-z]+$/i.test(specifier) && context.parentURL?.startsWith("file:")) {
    for (const ext of [".ts", ".mjs", ".js"]) {
      const candidate = new URL(specifier + ext, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
    }
  }
  return nextResolve(specifier, context);
}
