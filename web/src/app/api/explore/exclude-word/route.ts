import { NextResponse } from "next/server";
import { getActiveProfile, updateProfile } from "@/lib/core/search-profiles";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { word } : ajoute un mot aux exclusions du profil de recherche actif. */
export async function POST(req: Request) {
  const body = await readJsonObject<{ word?: unknown }>(req);
  const word = typeof body?.word === "string" ? body.word.trim().toLowerCase() : "";
  if (!/^[\p{L}\p{N}'’ -]{3,40}$/u.test(word)) return NextResponse.json({ error: "mot invalide" }, { status: 400 });
  const profile = getActiveProfile();
  if (!profile) return NextResponse.json({ error: "Aucun profil de recherche actif" }, { status: 404 });
  const negative = profile.negative.some((n) => n.toLowerCase() === word) ? profile.negative : [...profile.negative, word];
  const updated = updateProfile(profile.id, { negative });
  return updated ? NextResponse.json({ ok: true, negative: updated.negative, profile: updated.name }) : NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
}
