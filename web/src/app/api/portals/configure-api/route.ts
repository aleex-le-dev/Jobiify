import { NextResponse } from "next/server";
import { getEffectiveEnv, saveApiKeys, verifyApiCredentials } from "@/lib/core/env-config";
import { getApisStatus } from "@/lib/core/api-status";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEffectiveEnv();

  // On renvoie un aperçu masqué des clés
  const mask = (val?: string) => {
    if (!val || !val.trim()) return "";
    const clean = val.trim();
    if (clean.length <= 4) return "••••";
    return `••••••••${clean.slice(-4)}`;
  };

  return NextResponse.json({
    keys: {
      FRANCETRAVAIL_CLIENT_ID: mask(env.FRANCETRAVAIL_CLIENT_ID),
      FRANCETRAVAIL_CLIENT_SECRET: mask(env.FRANCETRAVAIL_CLIENT_SECRET),
      JOOBLE_API_KEY: mask(env.JOOBLE_API_KEY),
    },
    apis: getApisStatus(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await readJsonObject<{
      apiId?: string;
      keys?: Record<string, string>;
    }>(req);

    if (!body || !body.keys || Object.keys(body.keys).length === 0) {
      return NextResponse.json({ ok: false, error: "Aucune clé fournie" }, { status: 400 });
    }

    // Filtrer les valeurs masquées qui n'ont pas changé (si l'utilisateur n'a rien tapé de nouveau)
    const toSave: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.keys)) {
      if (typeof v === "string" && v.trim() && !v.startsWith("••••")) {
        toSave[k] = v.trim();
      }
    }

    if (Object.keys(toSave).length > 0) {
      saveApiKeys(toSave);
    }

    // Tester si un apiId spécifique est demandé
    let verification = { ok: true, message: "Clés enregistrées avec succès" };
    if (body.apiId) {
      verification = await verifyApiCredentials(body.apiId);
    }

    return NextResponse.json({
      ok: true,
      message: "Configuration sauvegardée avec succès",
      verification,
      apis: getApisStatus(),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Erreur interne" }, { status: 500 });
  }
}
