import { NextResponse } from "next/server";
import { readMarks, writeMarks, writeMarksRaw, type MarkableOffer } from "@/lib/core/offer-marks";
import { trackApplied, type TrackOutcome } from "@/lib/core/tracker-applied";
import { MARKS, muteCompany } from "@/lib/offer-marks.mjs";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ marks: readMarks() });
}

/** POST { offers: [{url,title,company,location}], mark: "applied" | "dismissed" | null } */
export async function POST(req: Request) {
  const body = await readJsonObject<{ offers?: unknown; mark?: unknown; muteCompany?: unknown }>(req);
  if (!body || !Array.isArray(body.offers)) return NextResponse.json({ error: "offers requis" }, { status: 400 });
  const mark = body.mark === null ? null : typeof body.mark === "string" && (MARKS as readonly string[]).includes(body.mark) ? body.mark : undefined;
  if (mark === undefined) return NextResponse.json({ error: "mark invalide" }, { status: 400 });

  const offers: MarkableOffer[] = body.offers
    .slice(0, 500)
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object" && /^https?:\/\//i.test(String((o as { url?: unknown }).url ?? "")))
    .map((o) => ({ url: String(o.url), title: String(o.title ?? ""), company: String(o.company ?? ""), location: String(o.location ?? "") }));
  if (offers.length === 0) return NextResponse.json({ error: "aucune offre valide" }, { status: 400 });

  let marks = writeMarks(offers, mark as "applied" | "dismissed" | null);
  // « Masquer toute l'entreprise » : une seule écriture de plus, avec les entreprises des offres reçues.
  if (body.muteCompany === true && mark === "dismissed") {
    for (const c of new Set(offers.map((o) => o.company))) marks = muteCompany(marks, c ?? "");
    writeMarksRaw(marks);
  }

  // « Déjà postulé » : l'offre entre aussi dans le suivi (un par un : chaque ajout prend le verrou du suivi).
  const tracked: Record<TrackOutcome, number> = { added: 0, updated: 0, already: 0, failed: 0 };
  if (mark === "applied") {
    const sources = new Map((body.offers as Array<{ url?: unknown; source?: unknown }>).map((o) => [String(o.url), String(o.source ?? "")]));
    for (const o of offers.slice(0, 25)) tracked[(await trackApplied({ ...o, url: o.url!, source: sources.get(o.url!) })).outcome]++;
  }
  return NextResponse.json({ ok: true, marks, ...(mark === "applied" ? { tracked } : {}) });
}
