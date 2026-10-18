// Client-safe types + codec for the Explorer (job discovery). NO node imports —
// both client components and server routes import this for the shared shapes, so
// the filter contract, the discovered-offer shape, and the stream-event grammar
// can never drift between the two halves. Server-only logic (spawning the scanner,
// writing temp files) lives in lib/core/{scan,portals,pipeline}.ts.

export type AtsSource = "portals" | "greenhouse" | "lever" | "ashby" | "workday";
export const ATS_SOURCES: AtsSource[] = ["portals", "workday", "greenhouse", "lever", "ashby"];
export const ATS_LABEL: Record<AtsSource, string> = {
  portals: "Portails locaux 62",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
};

/** Returns a precise, human-readable source label (e.g. "Service Public (62)", "France Travail") */
export function offerSourceLabel(offer: DiscoveredOffer, isFr = true): string {
  if (offer.source === "service-public-62") {
    return isFr ? "Service Public (62)" : "Public Sector (62)";
  }
  if (offer.source === "sirene-pme-62") {
    return isFr ? "PME Locale (SIRENE)" : "Local SME (SIRENE)";
  }
  if (offer.source === "france-travail") {
    return "France Travail";
  }
  if (offer.source === "la-bonne-boite-pme") {
    return "La Bonne Boîte";
  }
  if (offer.source?.startsWith("wttj")) {
    return "Welcome to the Jungle";
  }
  const atsKey = (offer.ats || "").replace(/-full$/, "") as AtsSource;
  return ATS_LABEL[atsKey] ?? offer.ats ?? (isFr ? "Portail local 62" : "Local Portal 62");
}

/** The full UI filter state. The keyword/location lists mirror scan.mjs's
 *  buildTitleFilter / buildLocationFilter semantics; sinceDays/ats/limitPerAts map
 *  to scan-ats-full.mjs's --since / --ats / --limit. */
export type ExploreFilters = {
  positive: string[];
  negative: string[];
  allow: string[];
  block: string[];
  blockHard: string[];
  alwaysAllow: string[];
  sinceDays: number;
  ats: AtsSource[];
  limitPerAts: number;
  commuteMinutes?: number;
  originCity?: string;
  remoteOnly?: boolean;
};

export type RecencyOption = { label: string; days: number };

export const RECENCY_FR: RecencyOption[] = [
  { label: "24 h", days: 1 },
  { label: "3 j", days: 3 },
  { label: "7 j", days: 7 },
  { label: "14 j", days: 14 },
  { label: "30 j", days: 30 },
  { label: "Toutes", days: 0 },
];

export const RECENCY_EN: RecencyOption[] = [
  { label: "24h", days: 1 },
  { label: "3d", days: 3 },
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "All", days: 0 },
];

export const DEFAULT_FILTERS: ExploreFilters = {
  positive: [],
  negative: [],
  allow: [],
  block: [],
  blockHard: [],
  alwaysAllow: [],
  sinceDays: 1,
  ats: ["portals", "workday", "greenhouse", "lever", "ashby"],
  limitPerAts: 150,
  commuteMinutes: 30,
  originCity: "Lières",
  remoteOnly: false,
};

/** Banded title-vs-profile overlap (web/src/lib/title-fit.mjs). Words, not
 *  numbers, so it can't be mistaken for the evaluation's real 1–5 / A–F. */
export type FitBand = "strong" | "related" | "weak";

export type DiscoveredOffer = {
  url: string;
  company: string;
  title: string;
  location: string;
  /** YYYY-MM-DD or full ISO timestamp, or "" when the engine reported n/a (AI offers always "") */
  postedAt: string;
  ats: string;
  source: string;
  /** which positive keyword matched the title (transparency, e.g. "ai" in "Nail") */
  matchedKeyword?: string;
  /** free, zero-token triage hint computed at discovery time from the posting
   *  TITLE vs config/profile.yml target roles (#3260). Recommendation layer
   *  only — never filters or orders anything; Evaluate gives the real A–F.
   *  Scan offers only; AI offers already carry why + confidence. */
  fit?: { band: FitBand; score: number };
  /** optional free-text ranking signal preserved to pipeline.md by the canonical
   *  writer (scan.mjs formatPipelineOffer). Generic and source-agnostic — an
   *  importer can attach a note; the deterministic scan omits it. */
  note?: string;
  // ── AI-search (modes/discover.md) additions — all optional, so the
  //    deterministic scan offer is unaffected (fields simply absent). ──
  /** present ONLY on AI offers → drives the "unverified" badge. AI finds can't be
   *  liveness-confirmed (AGENTS.md); the scan hits a live ATS API so it omits this. */
  verification?: "unconfirmed";
  /** one-line "why it matched" judgment (the thing a deterministic scan can't give) */
  why?: string;
  /** human freshness ("~5d ago", "unknown") shown when postedAt is "" */
  postedHint?: string;
  confidence?: "low" | "medium" | "high";
};

/** The two discovery surfaces: free deterministic Scan vs token-spending AI search. */
export type ExploreMode = "scan" | "ai";

/** Stream event grammar (NDJSON). `kind` discriminates. Discovery is FREE — the
 *  terminal `done` always carries cost {tokens:0, usd:0}. */
export type ScanEvent =
  | { kind: "start"; ats: string[]; sinceDays: number; limit: number; free: true }
  | { kind: "atsStart"; ats: string; companies: number }
  | { kind: "progress"; ats: string; scanned: number; total: number; matches: number }
  | { kind: "atsDone"; ats: string; unreachable: number }
  | { kind: "offer"; offer: DiscoveredOffer }
  | {
      kind: "summary";
      companiesScanned: number;
      unreachable: number;
      matches: number;
      // Authoritative degraded-vs-empty signals from the scanner's --json mode (#1199).
      // Absent on older local checkouts (the legacy human-stdout parse can't supply them).
      companiesAvailable?: number;
      capHit?: boolean;
      datasetStatus?: Record<string, "ok" | "stale" | "empty">;
      postingsDroppedNoDate?: number;
      // Sources whose results are missing (ran out of time or crashed) while the
      // others finished — a partial result, never "all caught up".
      incomplete?: string[];
    }
  | { kind: "log"; line: string }
  | { kind: "error"; message: string }
  | { kind: "done"; count: number; offers: DiscoveredOffer[]; cost?: { tokens: number; usd: number } };

// cleanChips is defined in clean-chips.mjs (plain JS) so it can be shared
// with the test suite without a TypeScript runner. Import for internal use
// and re-export for external consumers (filter-builder.tsx, etc.).
import { cleanChips } from "./clean-chips.mjs";
export { cleanChips };

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function cleanAts(v: unknown): AtsSource[] {
  if (!Array.isArray(v)) return [...ATS_SOURCES];
  const out = v
    .map((a) => String(a).toLowerCase())
    .filter((a): a is AtsSource => (ATS_SOURCES as string[]).includes(a));
  return out.length ? Array.from(new Set(out)) : [...ATS_SOURCES];
}

/** Apply a (possibly partial) action/assistant patch onto a base. The assistant
 *  emits {positive,negative,allow,block,alwaysAllow,since,ats,limit}. With
 *  merge=true, list fields are ADDED to the base; otherwise the given fields
 *  REPLACE. Unspecified fields are left as-is. */
export function parseExplorePatch(
  raw: Record<string, unknown>,
  base: ExploreFilters = DEFAULT_FILTERS,
  merge = false,
): ExploreFilters {
  const next: ExploreFilters = { ...base, ats: [...base.ats] };
  const lists: [keyof ExploreFilters, string][] = [
    ["positive", "positive"],
    ["negative", "negative"],
    ["allow", "allow"],
    ["block", "block"],
    ["blockHard", "blockHard"],
    ["alwaysAllow", "alwaysAllow"],
  ];
  for (const [field, key] of lists) {
    if (raw[key] === undefined) continue;
    const incoming = cleanChips(raw[key]);
    next[field] = (merge ? cleanChips([...(base[field] as string[]), ...incoming]) : incoming) as never;
  }
  if (raw.since !== undefined) next.sinceDays = clampNum(raw.since, 0, 60, base.sinceDays);
  if (raw.sinceDays !== undefined) next.sinceDays = clampNum(raw.sinceDays, 0, 60, base.sinceDays);
  if (raw.limit !== undefined) next.limitPerAts = clampNum(raw.limit, 50, 500, base.limitPerAts);
  if (raw.limitPerAts !== undefined) next.limitPerAts = clampNum(raw.limitPerAts, 50, 500, base.limitPerAts);
  if (raw.ats !== undefined) next.ats = cleanAts(raw.ats);
  if (raw.commuteMinutes !== undefined) next.commuteMinutes = clampNum(raw.commuteMinutes, 0, 120, 30);
  if (raw.originCity !== undefined) next.originCity = String(raw.originCity);
  if (raw.remoteOnly !== undefined) next.remoteOnly = Boolean(raw.remoteOnly);
  return next;
}

/** URL <-> filters codec (so a search is shareable/restorable). */
export function filtersToParams(f: ExploreFilters): string {
  const sp = new URLSearchParams();
  if (f.positive.length) sp.set("q", f.positive.join(","));
  if (f.negative.length) sp.set("not", f.negative.join(","));
  if (f.allow.length) sp.set("loc", f.allow.join(","));
  if (f.block.length) sp.set("noloc", f.block.join(","));
  if (f.blockHard.length) sp.set("hardno", f.blockHard.join(","));
  if (f.alwaysAllow.length) sp.set("home", f.alwaysAllow.join(","));
  if (f.sinceDays !== DEFAULT_FILTERS.sinceDays) sp.set("since", String(f.sinceDays));
  if (f.ats.length !== ATS_SOURCES.length) sp.set("ats", f.ats.join(","));
  if (f.limitPerAts !== DEFAULT_FILTERS.limitPerAts) sp.set("limit", String(f.limitPerAts));
  if (f.commuteMinutes) sp.set("commute", String(f.commuteMinutes));
  if (f.originCity && f.originCity !== "Lières") sp.set("from", f.originCity);
  if (f.remoteOnly) sp.set("remote", "1");
  return sp.toString();
}

export function paramsToFilters(sp: URLSearchParams, base: ExploreFilters = DEFAULT_FILTERS): ExploreFilters {
  const split = (s: string | null) => (s ? s.split(",") : undefined);
  return parseExplorePatch(
    {
      positive: split(sp.get("q")),
      negative: split(sp.get("not")),
      allow: split(sp.get("loc")),
      block: split(sp.get("noloc")),
      blockHard: split(sp.get("hardno")),
      alwaysAllow: split(sp.get("home")),
      since: sp.get("since") ?? undefined,
      ats: split(sp.get("ats")),
      limit: sp.get("limit") ?? undefined,
      commuteMinutes: sp.get("commute") ? Number(sp.get("commute")) : undefined,
      originCity: sp.get("from") ?? undefined,
      remoteOnly: sp.get("remote") === "1" ? true : undefined,
    },
    base,
  );
}

/** AI-search URL codec (so an AI hunt is shareable/restorable). */
export function aiToParams(intent: string): string {
  const sp = new URLSearchParams();
  sp.set("mode", "ai");
  if (intent.trim()) sp.set("intent", intent.trim());
  return sp.toString();
}

export function paramsToAi(sp: URLSearchParams): string | null {
  if (sp.get("mode") !== "ai") return null;
  return sp.get("intent") ?? "";
}

/** Is the search broad enough that "nothing found" means "you're current"
 *  (good news) rather than "loosen your filters" (actionable)? */
export function isBroadSearch(f: ExploreFilters): boolean {
  return f.positive.length <= 1 && f.block.length === 0 && f.allow.length === 0;
}
