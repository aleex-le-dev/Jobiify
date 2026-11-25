import { NextResponse } from "next/server";
import { loadMarket } from "@/lib/core/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Où sont les offres dans la zone du profil actif, par métier (sources sans clé, aucun jeton). */
export async function GET() {
  try {
    return NextResponse.json(await loadMarket());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "analyse impossible" }, { status: 500 });
  }
}
