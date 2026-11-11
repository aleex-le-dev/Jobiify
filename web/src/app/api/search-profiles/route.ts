import { NextResponse } from "next/server";
import { createProfile, listProfiles } from "@/lib/core/search-profiles";
import { readJsonObject } from "@/lib/json-body";
import type { SearchProfile } from "@/lib/search-profile-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CV_BYTES = 200_000;

export async function GET() {
  return NextResponse.json(listProfiles());
}

/** Crée un profil (typiquement juste après l'import d'un CV) et l'active. */
export async function POST(req: Request) {
  const body = await readJsonObject<Partial<SearchProfile> & { cvMarkdown?: string; activate?: boolean }>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  if (typeof body.cvMarkdown === "string" && Buffer.byteLength(body.cvMarkdown, "utf8") > MAX_CV_BYTES) {
    return NextResponse.json({ error: "CV trop volumineux (plus de 200 Ko)" }, { status: 413 });
  }
  try {
    const profile = createProfile(body, { activate: body.activate !== false });
    return NextResponse.json({ ok: true, profile, ...listProfiles() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "création impossible" }, { status: 500 });
  }
}
