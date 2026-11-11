import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { readLinks, saveLinks } from "@/lib/core/search-profiles";
import { cleanLinks, normalizeUrl } from "@/lib/cv-links.mjs";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liens déjà présents dans l'en-tête du CV actif (« **LinkedIn:** … »), proposés
 * au premier affichage pour ne pas avoir à les ressaisir.
 */
function suggestFromCv(): Array<{ label: string; url: string }> {
  try {
    const cv = fs.readFileSync(path.join(careerOpsRoot(), "cv.md"), "utf8");
    const head = cv.split(/^##\s/m)[0];
    const out: Array<{ label: string; url: string }> = [];
    for (const m of head.matchAll(/^\*\*([^*:\n]{1,40}):\*\*\s*(\S+)\s*$/gm)) {
      if (/^(e-?mail|location|localisation|t[ée]l[ée]phone|phone|ville)$/i.test(m[1].trim())) continue;
      if (normalizeUrl(m[2])) out.push({ label: m[1].trim(), url: m[2] });
    }
    return cleanLinks(out);
  } catch {
    return [];
  }
}

/** Liens personnels (LinkedIn, GitHub, portfolio…) partagés par tous les CV. */
export async function GET() {
  const links = readLinks();
  return NextResponse.json({ links, suggested: links.length ? [] : suggestFromCv() });
}

/** Enregistre les liens et les insère automatiquement dans l'en-tête de chaque CV. */
export async function PUT(req: Request) {
  const body = await readJsonObject<{ links?: Array<{ label?: string; url?: string }> }>(req);
  if (!body || !Array.isArray(body.links)) return NextResponse.json({ error: "links required" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...saveLinks(body.links) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "enregistrement impossible" }, { status: 500 });
  }
}
