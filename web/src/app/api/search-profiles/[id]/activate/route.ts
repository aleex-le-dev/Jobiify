import { NextResponse } from "next/server";
import { activateProfile, filtersFromProfile, listProfiles } from "@/lib/core/search-profiles";
import { seedExploreFilters } from "@/lib/core/portals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Active un profil : son CV devient cv.md (ancien sauvegardé en .bak) et la
 * réponse renvoie les filtres Explorer correspondants, prêts à appliquer.
 */
export async function POST(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  try {
    const profile = activateProfile(id);
    if (!profile) return NextResponse.json({ error: "Profil introuvable" }, { status: 404 });
    // Les blocages géographiques de portals.yml (pays étrangers…) restent appliqués.
    const base = seedExploreFilters().filters;
    return NextResponse.json({ ok: true, profile, filters: filtersFromProfile(profile, base), ...listProfiles() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "activation impossible" }, { status: 500 });
  }
}
