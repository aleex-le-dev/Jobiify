import { NextResponse } from "next/server";
import path from "node:path";
import { saveApiKeys } from "@/lib/core/env-config";
import { obsidianStatus, syncObsidian } from "@/lib/core/obsidian";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(obsidianStatus());
}

/** POST { dir? } : enregistre le dossier (s'il est fourni) puis synchronise les notes. */
export async function POST(req: Request) {
  const body = await readJsonObject<{ dir?: string }>(req);
  try {
    if (typeof body?.dir === "string" && body.dir.trim()) {
      const dir = body.dir.trim().replace(/^["']|["']$/g, "");
      if (!path.isAbsolute(dir)) return NextResponse.json({ ok: false, error: "Indiquez un chemin absolu (ex. C:\\Users\\vous\\Documents\\Coffre\\jobiify)." }, { status: 400 });
      saveApiKeys({ JOBIIFY_OBSIDIAN_DIR: dir }); // refuse un retour à la ligne (injection de lignes dans .env)
    }
    return NextResponse.json({ ok: true, ...syncObsidian() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Synchronisation impossible" }, { status: 400 });
  }
}
