import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";

export interface ApiCredentials {
  FRANCETRAVAIL_CLIENT_ID?: string;
  FRANCETRAVAIL_CLIENT_SECRET?: string;
  JOOBLE_API_KEY?: string;
}

export function readEnvFile(): string {
  const envPath = path.join(careerOpsRoot(), ".env");
  if (fs.existsSync(envPath)) {
    return fs.readFileSync(envPath, "utf8");
  }
  return "";
}

export function getEffectiveEnv(): Record<string, string> {
  const raw = readEnvFile();
  const result: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      result[k] = v;
    }
  }

  // Fusionner avec process.env pour les valeurs actives
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) {
      result[k] = v;
    }
  }

  return result;
}

export function saveApiKeys(updates: Record<string, string>): void {
  const root = careerOpsRoot();
  const envPath = path.join(root, ".env");
  let content = readEnvFile();

  for (const [key, val] of Object.entries(updates)) {
    const cleanVal = val.trim().replace(/^["']|["']$/g, "").trim();
    process.env[key] = cleanVal;

    // Chercher une ligne existante (commentée ou non)
    // Exemple: # FRANCETRAVAIL_CLIENT_ID=... ou FRANCETRAVAIL_CLIENT_ID=...
    const lineRegex = new RegExp(`^(?:#\\s*)?(${key}\\s*=).*$`, "m");
    if (lineRegex.test(content)) {
      content = content.replace(lineRegex, `${key}=${cleanVal}`);
    } else {
      content += `\n${key}=${cleanVal}`;
    }
  }

  fs.writeFileSync(envPath, content, "utf8");

  // Synchroniser aussi avec web/.env.local pour Next.js dev server
  try {
    const webEnvLocal = path.join(root, "web", ".env.local");
    let localContent = fs.existsSync(webEnvLocal) ? fs.readFileSync(webEnvLocal, "utf8") : "";
    for (const [key, val] of Object.entries(updates)) {
      const cleanVal = val.trim();
      const lineRegex = new RegExp(`^(?:#\\s*)?(${key}\\s*=).*$`, "m");
      if (lineRegex.test(localContent)) {
        localContent = localContent.replace(lineRegex, `${key}=${cleanVal}`);
      } else {
        localContent += `\n${key}=${cleanVal}`;
      }
    }
    fs.writeFileSync(webEnvLocal, localContent, "utf8");
  } catch {}
}

export async function verifyApiCredentials(apiId: string): Promise<{ ok: boolean; message: string }> {
  const env = getEffectiveEnv();

  if (apiId === "france-travail" || apiId === "la-bonne-boite") {
    const cid = env.FRANCETRAVAIL_CLIENT_ID?.trim();
    const sec = env.FRANCETRAVAIL_CLIENT_SECRET?.trim();
    if (!cid || !sec) {
      return { ok: false, message: "Client ID ou Client Secret manquant" };
    }
    try {
      const tokenUrl = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
      const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: cid,
        client_secret: sec,
        scope: "api_offresdemploiv2 o2dsoffre",
      });
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (res.ok) {
        return { ok: true, message: "Authentification France Travail réussie (OAuth2 validé)" };
      }
      return { ok: false, message: `Échec d'authentification France Travail (HTTP ${res.status}) - vérifiez vos clés` };
    } catch (e: any) {
      return { ok: false, message: `Erreur de connexion : ${e.message}` };
    }
  }

  if (apiId === "jooble") {
    const rawKey = env.JOOBLE_API_KEY?.trim() || "";
    const key = rawKey.replace(/^["']|["']$/g, "").trim();
    if (!key) {
      return { ok: false, message: "Clé API Jooble manquante" };
    }
    try {
      const url = `https://jooble.org/api/${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        body: JSON.stringify({ keywords: "informatique", location: "Pas-de-Calais, France", page: 1 }),
      });
      if (res.ok) {
        return { ok: true, message: "Connexion Jooble réussie · Clé API validée" };
      }
      return { ok: false, message: `Échec de connexion Jooble (HTTP ${res.status})` };
    } catch (e: any) {
      return { ok: false, message: `Erreur de connexion Jooble : ${e.message}` };
    }
  }

  return { ok: true, message: "Cette API ne nécessite aucune clé" };
}
