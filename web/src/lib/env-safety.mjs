// Garde-fous pour ce qui est écrit dans `.env` et pour les liens venant des sources.
// Pur et sans dépendance : testable avec `node --test`.

/** Seules variables que l'interface a le droit d'écrire dans `.env`. */
export const EDITABLE_ENV_KEYS = Object.freeze([
  "FRANCETRAVAIL_CLIENT_ID",
  "FRANCETRAVAIL_CLIENT_SECRET",
  "JOOBLE_API_KEY",
  "ADZUNA_APP_ID",
  "ADZUNA_APP_KEY",
  "CAREERJET_AFFID",
  "JOBIIFY_OBSIDIAN_DIR",
]);

const CONTROL = new RegExp("[\u0000-\u001f\u007f\u2028\u2029]");

/**
 * Vérifie un lot de variables avant écriture : nom autorisé, valeur sur une seule ligne.
 * Un retour à la ligne dans une valeur ajouterait des lignes arbitraires au fichier.
 * @param {Record<string, unknown>} updates
 * @returns {{ ok: true, clean: Record<string, string> } | { ok: false, error: string }}
 */
export function validateEnvUpdates(updates) {
  const clean = {};
  for (const [key, raw] of Object.entries(updates ?? {})) {
    if (!EDITABLE_ENV_KEYS.includes(key)) return { ok: false, error: `Variable non modifiable depuis l'interface : ${key.slice(0, 40)}` };
    if (typeof raw !== "string") return { ok: false, error: `Valeur invalide pour ${key}` };
    const value = raw.trim().replace(/^["']|["']$/g, "").trim();
    if (CONTROL.test(value)) return { ok: false, error: `Valeur invalide pour ${key} : retour à la ligne ou caractère de contrôle` };
    if (value.length > 1000) return { ok: false, error: `Valeur trop longue pour ${key}` };
    clean[key] = value;
  }
  return { ok: true, clean };
}

/** Lien web ouvrable : http(s) uniquement, sans espace ni caractère de contrôle. */
export function isHttpUrl(value) {
  const s = String(value ?? "").trim();
  if (!/^https?:\/\//i.test(s) || CONTROL.test(s) || /\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && Boolean(u.hostname);
  } catch {
    return false;
  }
}
