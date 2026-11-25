import { NextResponse } from "next/server";
import { getActiveProfile, updateProfile } from "@/lib/core/search-profiles";
import { expandTitles } from "@/lib/job-synonyms.mjs";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { title } : ajoute un métier aux postes visés du profil actif, avec ses synonymes (les vôtres sont conservés). */
export async function POST(req: Request) {
  const body = await readJsonObject<{ title?: unknown }>(req);
  const title = typeof body?.title === "string" ? body.title.trim().replace(/\s+/g, " ") : "";
  if (title.length < 3 || title.length > 80 || /[\u0000-\u001f]/.test(title)) return NextResponse.json({ error: "métier invalide" }, { status: 400 });
  const profile = getActiveProfile();
  if (!profile) return NextResponse.json({ error: "Aucun profil de recherche actif" }, { status: 404 });

  const has = (list: string[], t: string) => list.some((x) => x.toLowerCase() === t.toLowerCase());
  const titles = has(profile.titles, title) ? profile.titles : [...profile.titles, title];
  const extra = (expandTitles([title]) as string[]).filter((s) => !has(profile.synonyms, s) && !has(titles, s));
  const updated = updateProfile(profile.id, { titles, synonyms: [...profile.synonyms, ...extra].slice(0, 120) });
  return updated
    ? NextResponse.json({ ok: true, titles: updated.titles, synonyms: updated.synonyms, added: extra.length })
    : NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
}
