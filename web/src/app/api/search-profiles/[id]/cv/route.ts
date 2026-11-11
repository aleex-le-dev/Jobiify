import { NextResponse } from "next/server";
import { getProfile, readProfileCv, saveProfileCv } from "@/lib/core/search-profiles";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CV_BYTES = 200_000;
type RouteContext = { params: Promise<{ id: string }> };

/** CV Markdown d'un profil (data/profiles/{id}/cv.md). */
export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!getProfile(id)) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  const content = readProfileCv(id);
  return NextResponse.json({ content, exists: content.trim().length > 0 });
}

/** Enregistre le CV d'un profil ; s'il est actif, cv.md est mis à jour aussi (avec .bak). */
export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!getProfile(id)) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  const body = await readJsonObject<{ content?: string }>(req);
  if (!body || typeof body.content !== "string") return NextResponse.json({ error: "content required" }, { status: 400 });
  if (Buffer.byteLength(body.content, "utf8") > MAX_CV_BYTES) {
    return NextResponse.json({ error: "CV trop volumineux (plus de 200 Ko)" }, { status: 413 });
  }
  try {
    saveProfileCv(id, body.content);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "écriture impossible" }, { status: 500 });
  }
}
