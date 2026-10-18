import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { norm } from "@/lib/core/zone";

interface CommuneRef {
  nom: string;
  code: string;
  codesPostaux: string[];
  population?: number;
  departement?: { code?: string; nom?: string };
}

let localCommunesCache: CommuneRef[] | null = null;

function loadLocalCommunes(): CommuneRef[] {
  if (localCommunesCache) return localCommunesCache;
  try {
    const file = path.join(careerOpsRoot(), "data", "cache", "communes-local.json");
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      localCommunesCache = JSON.parse(raw) as CommuneRef[];
      return localCommunesCache;
    }
  } catch (err) {
    console.warn("[api/explore/cities] Impossible de lire communes-local.json:", err);
  }
  return [];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const nq = norm(q);
  const isPostal = /^\d{2,5}$/.test(q);
  const localList = loadLocalCommunes();

  // 1. Recherche ultra-rapide dans les 2305 communes locales (62, 59, 80)
  let hits: CommuneRef[] = [];
  if (isPostal) {
    hits = localList.filter((c) => (c.codesPostaux || []).some((cp) => cp.startsWith(q)));
  } else {
    hits = localList.filter((c) => {
      const nc = norm(c.nom);
      return nc.startsWith(nq) || nc.includes(nq);
    });

    hits.sort((a, b) => {
      const na = norm(a.nom);
      const nb = norm(b.nom);
      const aStarts = na.startsWith(nq);
      const bStarts = nb.startsWith(nq);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return (b.population || 0) - (a.population || 0);
    });
  }

  // 2. Si peu de résultats locaux ou recherche nationale spécifique, interroger geo.api.gouv.fr (avec timeout court de 2s)
  if (hits.length < 5) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const url = isPostal
        ? `https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(q)}&fields=nom,code,codesPostaux,population,departement&limit=8`
        : `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=nom,code,codesPostaux,population,departement&limit=8&boost=population`;

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const remoteData = (await res.json()) as CommuneRef[];
        const seenCodes = new Set(hits.map((h) => h.code));
        for (const item of remoteData) {
          if (!seenCodes.has(item.code)) {
            hits.push(item);
            seenCodes.add(item.code);
          }
        }
      }
    } catch {
      // Ignorer les erreurs réseau distantes et conserver les résultats locaux
    }
  }

  const results = hits.slice(0, 10).map((c) => {
    const cp = c.codesPostaux?.[0] || "";
    const depCode = c.departement?.code || cp.slice(0, 2);
    const depNom = c.departement?.nom ? `${c.departement.nom} (${depCode})` : depCode ? `(${depCode})` : "";
    return {
      nom: c.nom,
      codeInsee: c.code,
      codePostal: cp,
      codesPostaux: c.codesPostaux || [],
      departement: depNom,
      label: `${c.nom} (${cp})`,
    };
  });

  return NextResponse.json(results);
}
