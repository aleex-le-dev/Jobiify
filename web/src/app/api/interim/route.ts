import { NextResponse } from "next/server";
import { loadInterimOffers } from "@/lib/core/interim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Missions d'intérim autour du point de départ du profil actif, tous métiers. */
export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  try {
    return NextResponse.json(await loadInterimOffers({ fresh }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "chargement impossible" }, { status: 500 });
  }
}
