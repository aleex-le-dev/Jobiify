import { NextResponse } from "next/server";
import { deleteProfile, getProfile, listProfiles, readProfileCv, updateProfile } from "@/lib/core/search-profiles";
import { readJsonObject } from "@/lib/json-body";
import type { SearchProfile } from "@/lib/search-profile-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const profile = getProfile(id);
  if (!profile) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
  return NextResponse.json({ profile, cv: readProfileCv(id) });
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await readJsonObject<Partial<SearchProfile> & { regenerateSynonyms?: boolean }>(req);
  if (!body) return NextResponse.json({ error: "bad json" }, { status: 400 });
  const profile = updateProfile(id, body);
  return profile
    ? NextResponse.json({ ok: true, profile, ...listProfiles() })
    : NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  return deleteProfile(id)
    ? NextResponse.json({ ok: true, ...listProfiles() })
    : NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
}
