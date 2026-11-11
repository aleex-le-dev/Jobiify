import { spawn } from "node:child_process";
import fs from "node:fs";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";
import type { DiscoveredOffer, ExploreFilters, FitBand } from "@/lib/explore";
import { titleFit } from "@/lib/title-fit.mjs";
import { acceptInZone, type Zone } from "./zone";

/**
 * Interroge EN DIRECT tous les portails de portals.yml (employeurs suivis +
 * sites d'intérim) via le script cœur scripts/portal-live.mjs, puis applique les filtres
 * du profil (postes + synonymes, exclusions) et la zone de trajet.
 * Aucune écriture : c'est l'utilisateur qui choisit quoi ajouter au pipeline.
 */

export interface LiveOffer {
  company: string;
  title: string;
  url: string;
  location: string;
  postedAt: string;
  source: string;
  /** Catégorie déclarée dans portals.yml (ex. « interim »). */
  category?: string;
  /** Nom de l'entrée portals.yml qui a fourni l'offre. */
  portal?: string;
}

type LiveResult = { offers: LiveOffer[]; errors: Array<{ name: string; error: string }> };

// Cache mémoire partagé (recherche d'offres + page Missions d'intérim) : une
// lecture complète des portails prend ~10 s, inutile de la refaire à chaque page.
const LIVE_TTL_MS = 20 * 60 * 1000;
let liveCache: { at: number; result: LiveResult } | null = null;
let liveInflight: Promise<LiveResult> | null = null;

/** Offres actuelles de tous les portails, avec cache de 20 min. */
export async function getPortalLiveRaw({ fresh = false } = {}): Promise<LiveResult> {
  if (!fresh && liveCache && Date.now() - liveCache.at < LIVE_TTL_MS) return liveCache.result;
  if (liveInflight) return liveInflight;
  liveInflight = runPortalLive()
    .then((result) => {
      if (result.offers.length) liveCache = { at: Date.now(), result };
      return result;
    })
    .finally(() => {
      liveInflight = null;
    });
  return liveInflight;
}

const TIMEOUT_MS = 120_000;

function runPortalLive(): Promise<LiveResult> {
  const script = rootScript("portal-live");
  if (!fs.existsSync(script)) return Promise.resolve({ offers: [], errors: [{ name: "scripts/portal-live.mjs", error: "script absent" }] });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd: careerOpsRoot(), env: process.env });
    let out = "";
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(out.trim().split("\n").pop() || "{}");
        resolve({ offers: Array.isArray(parsed.offers) ? parsed.offers : [], errors: Array.isArray(parsed.errors) ? parsed.errors : [] });
      } catch {
        resolve({ offers: [], errors: [{ name: "scripts/portal-live.mjs", error: "sortie illisible" }] });
      }
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ offers: [], errors: [{ name: "scripts/portal-live.mjs", error: "lancement impossible" }] });
    });
  });
}

function matchesKeyword(text: string, kw: string): boolean {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const k = fold(kw);
  if (!k) return false;
  const t = fold(text);
  if (k.length <= 3) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(t);
  }
  return t.includes(k);
}

function fitField(title: string, targets: string[]): { fit: { band: FitBand; score: number } } | Record<string, never> {
  const f = titleFit(title, targets);
  return f ? { fit: { band: f.band as FitBand, score: f.score } } : {};
}

export async function loadPortalLiveOffers(
  filters: ExploreFilters,
  roleTargets: string[],
  zone?: Zone,
): Promise<{ offers: DiscoveredOffer[]; boards: number; errors: number }> {
  const { offers: raw, errors } = await getPortalLiveRaw();
  const sinceMs = filters.sinceDays > 0 ? Date.now() - filters.sinceDays * 86_400_000 : 0;
  const offers: DiscoveredOffer[] = [];
  const boards = new Set<string>();

  for (const o of raw) {
    // Les agences d'intérim passent par la source « Intérim » (étiquette + agence).
    if (o.category === "interim") continue;
    boards.add(o.company);
    if (filters.negative.some((n) => n && matchesKeyword(o.title, n))) continue;
    if (filters.positive.length > 0 && !filters.positive.some((p) => p && matchesKeyword(o.title, p))) continue;
    const loc = o.location || "";
    if ([...(filters.blockHard || []), ...(filters.block || [])].some((b) => b && matchesKeyword(loc, b))) continue;
    if (filters.remoteOnly && !/t[ée]l[ée]travail|remote/i.test(`${o.title} ${loc}`)) continue;
    if (zone && !filters.remoteOnly && !acceptInZone({ ville: loc, texte: o.title }, zone)) continue;
    if (sinceMs && o.postedAt) {
      const t = Date.parse(o.postedAt);
      if (Number.isFinite(t) && t < sinceMs) continue;
    }
    offers.push({
      company: o.company,
      title: o.title,
      location: loc,
      postedAt: o.postedAt || "",
      ats: "portals",
      source: `portal-${o.source}`,
      url: o.url,
      matchedKeyword: filters.positive.find((p) => p && matchesKeyword(o.title, p)),
      ...fitField(o.title, roleTargets),
    });
  }
  return { offers, boards: boards.size, errors: errors.length };
}
