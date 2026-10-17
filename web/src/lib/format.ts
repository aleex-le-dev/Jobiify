// Pure, node-free helpers shared by server and client components (no fs/path
// imports here — career-ops.ts holds the filesystem reads). Aligned with the
// core: normalize-statuses.mjs (aliases) + the Go TUI dashboard (score/status
// colours = the current state-of-the-art).

// Alias → canonical stage. Lives in status-alias.mjs so a `node --test` unit
// test can load it and assert it still covers templates/states.yml (#2917);
// a hand-maintained copy is what drifted in #2249 and again after #2705.
import { canonStatus } from "@/lib/status-alias.mjs";

export { canonStatus };

export const CANONICAL_STATES = [
  "Evaluated",
  "Applied",
  "Responded",
  "Assessment",
  "Interview",
  "Offer",
  "Hired",
  "Rejected",
  "Discarded",
  "SKIP",
] as const;

/** Status dot colour, mirroring the Go TUI: green hired/interview/offer, sky
 *  applied/responded/assessment, red skip/rejected, gray discarded, neutral evaluated. */
export function statusDot(status: string): string {
  const c = canonStatus(status);
  // Hired is the terminal win — the best outcome, never a neutral gray dot.
  if (c.includes("HIRED") || c.includes("INTERVIEW") || c.includes("OFFER")) return "bg-emerald-400";
  if (c.includes("APPLIED") || c.includes("RESPONDED") || c.includes("ASSESSMENT")) return "bg-sky-400";
  if (c.includes("REJECTED") || c.includes("SKIP")) return "bg-red-400";
  if (c.includes("DISCARDED")) return "bg-zinc-600";
  return "bg-zinc-500"; // Evaluated / unknown
}

/** First number in a score string ("4.1/5", "B+", "3.0") → numeric, or NaN. */
export function scoreNum(s: string): number {
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : NaN;
}

/** Score → tone, mirroring the Go TUI thresholds (>=4.2 green, >=3.8 yellow,
 *  >=3.0 normal, <3.0 red). */
export function scoreTone(score: string): "good" | "warn" | "bad" | "muted" {
  const num = scoreNum(score);
  if (!Number.isNaN(num)) {
    if (num >= 4.2) return "good";
    if (num >= 3.8) return "warn";
    if (num >= 3.0) return "muted";
    return "bad";
  }
  const g = score.trim().toUpperCase()[0];
  if (g === "A") return "good";
  if (g === "B") return "warn";
  if (g === "C") return "muted";
  if (g === "D" || g === "E" || g === "F") return "bad";
  return "muted";
}

/** Block-G legitimacy tier → tone. */
export function legitimacyTone(l: string): "good" | "warn" | "bad" | "muted" {
  const s = l.toLowerCase();
  if (s.includes("high") || s.includes("confian") || s.includes("legit")) return "good";
  if (s.includes("caution") || s.includes("precau") || s.includes("caut")) return "warn";
  if (s.includes("suspic") || s.includes("sospech") || s.includes("scam") || s.includes("fake")) return "bad";
  return "muted";
}

export type ReportMeta = {
  title: string | null;
  fields: { label: string; value: string }[];
  legitimacy: string | null;
  body: string;
};

const FIELD_KEYS: Record<string, string> = {
  date: "Date",
  fecha: "Date",
  url: "URL",
  archetype: "Archetype",
  arquetipo: "Archetype",
  score: "Score",
  decision: "Decision",
  legitimacy: "Legitimacy",
  legitimidad: "Legitimacy",
  pdf: "PDF",
};

/**
 * Tolerant report parser (per maintainer: adapt the render, don't migrate the
 * old data). Extracts the bold key/value header fields (Date/URL/Archetype/
 * Score/Legitimacy/PDF) when present and returns the body without the header
 * block. Degrades gracefully on legacy reports that lack some fields.
 */
export function parseReport(md: string): ReportMeta {
  const lines = md.split("\n");
  // Header runs until the first `---` or the first `## ` section.
  let cut = lines.findIndex((l, i) => i > 0 && (/^\s*-{3,}\s*$/.test(l) || /^##\s/.test(l)));
  if (cut === -1) cut = Math.min(lines.length, 10);

  const headerLines = lines.slice(0, cut);
  let bodyStart = cut;
  if (/^\s*-{3,}\s*$/.test(lines[cut] ?? "")) bodyStart = cut + 1;
  const body = lines.slice(bodyStart).join("\n").trim();

  let title: string | null = null;
  let legitimacy: string | null = null;
  const fields: { label: string; value: string }[] = [];

  for (const l of headerLines) {
    const h = l.match(/^#\s+(.+)/);
    if (h) {
      title = h[1].replace(/^Evaluat?i[oó]n:?\s*/i, "").trim();
      continue;
    }
    const m = l.match(/^\s*\*\*(.+?):\*\*\s*(.*)$/);
    if (!m) continue;
    const label = FIELD_KEYS[m[1].trim().toLowerCase()];
    const value = m[2].trim();
    if (!label || !value) continue;
    if (label === "Legitimacy") legitimacy = value;
    fields.push({ label, value });
  }

  return { title, fields, legitimacy, body: body || md };
}

/** Converts a word or hyphenated string to Title Case preserving accents. */
export function toTitleCase(str: string): string {
  if (!str) return "";
  return str.toLowerCase().replace(/(^|[\s\-\x27])([a-zà-öø-ÿ])/g, (_, p1, p2) => p1 + p2.toUpperCase());
}

/** Normalizes various date formats (DD/MM/YYYY, ISO timestamp, etc.) to YYYY-MM-DD. */
export function normalizeDateToIso(rawDate?: string | null): string {
  if (!rawDate) return "";
  const s = String(rawDate).trim();
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (fr) {
    const d = fr[1].padStart(2, "0");
    const m = fr[2].padStart(2, "0");
    const y = fr[3];
    return `${y}-${m}-${d}`;
  }
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return "";
}

function isStreetPrefix(s: string): boolean {
  return /^(?:\d+\s+)?(?:rue|boulevard|bld|bd|avenue|av|chemin|route|all[ée]e|impasse|place|quai|residence|parc)\b/i.test(s.trim());
}

/**
 * Extracts a clean city + postal code (e.g. "Lillers (62192)") instead of full street address.
 */
export function formatLocationCity(raw?: string | null): string {
  if (!raw) return "";
  let s = String(raw).trim();
  if (!s) return "";

  // Strip trailing country references
  s = s.replace(/,\s*France\b/i, "").replace(/-\s*France\b/i, "").trim();

  // If there is a colon (common in public sector address fields: "Street : 62192 City")
  if (s.includes(":")) {
    const after = s.split(":").pop()?.trim();
    if (after) s = after;
  }

  // Administrative police department code: e.g. "DIPN62/CPN BETHUNE" or "DIPN62"
  if (/^dipn\s*62/i.test(s)) {
    const after = s.match(/^dipn\s*62\s*\/\s*(?:cpn\s+)?([A-Za-zÀ-ÖØ-öø-ÿ\s-]+)/i);
    if (after) return `${toTitleCase(after[1].trim())} (62)`;
    return "Pas-de-Calais (62)";
  }

  // 1. Match postal code followed by city name: "62192 Lillers" or "25 RUE DE PERNES 62190 LILLERS"
  const zipCityMatch = s.match(/\b(\d{5})\s+([A-Za-zÀ-ÖØ-öø-ÿ\s\x27\-]+)$/);
  if (zipCityMatch) {
    const zip = zipCityMatch[1];
    let city = zipCityMatch[2].trim();
    city = city.replace(/\s+(?:cedex|bp|cs)\b.*$/i, "").trim();
    return `${toTitleCase(city)} (${zip})`;
  }

  // Also check if zip code is in the middle: e.g. "62190 Lillers - France"
  const zipCityMid = s.match(/\b(\d{5})\s+([A-Za-zÀ-ÖØ-öø-ÿ\s\x27\-]+)/);
  if (zipCityMid) {
    const zip = zipCityMid[1];
    let city = zipCityMid[2].trim();
    city = city.replace(/\s+(?:cedex|bp|cs)\b.*$/i, "").trim();
    if (city.length > 2) {
      return `${toTitleCase(city)} (${zip})`;
    }
  }

  // 2. Department prefix like "62 - LILLERS" or "62 - BETHUNE"
  const deptMatch = s.match(/^(\d{2,3})\s*-\s*([A-Za-zÀ-ÖØ-öø-ÿ\s\x27\-]+)/);
  if (deptMatch) {
    const dept = deptMatch[1];
    const city = toTitleCase(deptMatch[2].trim());
    return `${city} (${dept})`;
  }

  // 3. City with postal code in parentheses: "Lillers (62190)" or "Pas-de-Calais (62)"
  const parenMatch = s.match(/^([A-Za-zÀ-ÖØ-öø-ÿ\s\x27\-]+)\s*\((62\d*|\d{2,5})\)$/);
  if (parenMatch) {
    return `${toTitleCase(parenMatch[1].trim())} (${parenMatch[2]})`;
  }

  // 4. Comma-separated: "12 rue victor hugo, Lillers" or "Béthune, Hauts-de-France"
  if (s.includes(",")) {
    const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1 && isStreetPrefix(parts[0])) {
      return toTitleCase(parts[1]);
    }
    return toTitleCase(parts[0]);
  }

  return toTitleCase(s);
}

/** Formats publication date to a clean, readable localized label (date + relative age). */
export function formatPublicationDate(
  rawDate?: string | null,
  isFr: boolean = true,
): { formattedDate?: string; relativeAge?: string; label?: string } {
  if (!rawDate) return {};
  const trimmed = String(rawDate).trim();
  if (!trimmed) return {};

  let d: Date | null = null;
  const frMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (frMatch) {
    const day = parseInt(frMatch[1], 10);
    const month = parseInt(frMatch[2], 10) - 1;
    const year = parseInt(frMatch[3], 10);
    d = new Date(Date.UTC(year, month, day));
  } else if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    d = new Date(trimmed.slice(0, 10) + "T00:00:00Z");
  }

  if (!d || isNaN(d.getTime())) {
    return {
      relativeAge: trimmed,
      label: isFr ? `Publié ${trimmed}` : `Posted ${trimmed}`,
    };
  }

  const now = Date.now();
  const diffDays = Math.max(0, Math.round((now - d.getTime()) / 86_400_000));

  let relativeAge = "";
  if (isFr) {
    relativeAge = diffDays === 0 ? "aujourd'hui" : diffDays === 1 ? "hier" : `il y a ${diffDays}j`;
  } else {
    relativeAge = diffDays === 0 ? "today" : diffDays === 1 ? "1d ago" : `${diffDays}d ago`;
  }

  const formattedDate = new Intl.DateTimeFormat(isFr ? "fr-FR" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);

  let label = "";
  if (isFr) {
    if (diffDays === 0) {
      label = `Publié aujourd'hui (${formattedDate})`;
    } else if (diffDays === 1) {
      label = `Publié hier (${formattedDate})`;
    } else if (diffDays <= 30) {
      label = `Publié le ${formattedDate} (${relativeAge})`;
    } else {
      label = `Publié le ${formattedDate}`;
    }
  } else {
    if (diffDays === 0) {
      label = `Posted today (${formattedDate})`;
    } else if (diffDays === 1) {
      label = `Posted yesterday (${formattedDate})`;
    } else if (diffDays <= 30) {
      label = `Posted ${formattedDate} (${relativeAge})`;
    } else {
      label = `Posted ${formattedDate}`;
    }
  }

  return { formattedDate, relativeAge, label };
}
