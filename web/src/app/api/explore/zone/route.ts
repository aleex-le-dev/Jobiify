import { NextRequest, NextResponse } from "next/server";
import { loadZone, rayonMaxKm } from "@/lib/core/zone";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const minutesParam = searchParams.get("minutes");
    const villeParam = searchParams.get("ville") || "Lières";

    const minutes = Math.max(5, Math.min(120, Number(minutesParam) || 30));
    const zone = await loadZone(minutes, villeParam);

    return NextResponse.json({
      ok: true,
      minutes,
      villeDepart: zone.villeDepart,
      origin: zone.origin,
      rayonMaxKm: Math.round(rayonMaxKm(zone) * 10) / 10,
      method: zone.method,
      communesCount: zone.communes.length,
      communes: zone.communes.map((c) => ({
        nom: c.nom,
        code: c.code,
        codesPostaux: c.codesPostaux,
      })),
      codesPostaux: Array.from(zone.cps).sort(),
    });
  } catch (err: any) {
    console.error("[api/explore/zone] Erreur:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Impossible de charger la zone." },
      { status: 500 },
    );
  }
}
