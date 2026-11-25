import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot, readApplications, rootScript } from "@/lib/career-ops";
import { ADVANCED_STATUSES, appliedTsv, findExistingApplication } from "@/lib/applied-row.mjs";
import { parseCliJson } from "@/lib/status-cli.mjs";

export type TrackOutcome = "added" | "updated" | "already" | "failed";
export type TrackableOffer = { url: string; title?: string; company?: string; location?: string; source?: string };

const TIMEOUT_MS = 30_000;

function run(script: string, args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [rootScript(script), ...args],
      // Attente du verrou du suivi bornée : un suivi occupé répond vite au lieu de bloquer la page.
      { cwd: careerOpsRoot(), timeout: TIMEOUT_MS, windowsHide: true, env: { ...process.env, CAREER_OPS_TRACKER_LOCK_TIMEOUT_MS: "10000" } },
      (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() }),
    );
  });
}

const localToday = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-JJ, heure locale

/**
 * Enregistre une offre « Déjà postulé » dans le suivi (statut Applied) :
 *  - déjà présente et déjà partie → rien ;
 *  - déjà présente (évaluée, écartée…) → son statut passe à Applied ;
 *  - absente → nouvelle ligne, sans rapport (score N/A).
 * Toutes les écritures passent par les scripts du cœur (verrou, validation, journal).
 */
export async function trackApplied(offer: TrackableOffer): Promise<{ outcome: TrackOutcome; n?: string }> {
  for (const s of ["reserve-report-num", "merge-tracker", "set-status"]) {
    if (!fs.existsSync(rootScript(s))) return { outcome: "failed" };
  }

  const existing = findExistingApplication(readApplications(), offer);
  if (existing) {
    if (ADVANCED_STATUSES.has(existing.status ?? "")) return { outcome: "already", n: existing.n };
    const res = await run("set-status", ["--row", String(existing.n), "Applied", "--note", "Marquée postulée depuis la recherche", "--source", "web", "--json"]);
    return parseCliJson(res.stdout)?.error || !res.ok ? { outcome: "failed", n: existing.n } : { outcome: "updated", n: existing.n };
  }

  const reserved = await run("reserve-report-num", []);
  const num = reserved.stdout.trim();
  if (!reserved.ok || !/^\d{3,}$/.test(num)) return { outcome: "failed" };

  const additions = path.join(careerOpsRoot(), "batch", "tracker-additions");
  const tsv = path.join(additions, `${num}-postule-depuis-recherche.tsv`);
  let outcome: TrackOutcome = "failed";
  try {
    fs.mkdirSync(additions, { recursive: true });
    fs.writeFileSync(
      tsv,
      appliedTsv({ num, today: localToday(), company: offer.company ?? "", title: offer.title ?? "", location: offer.location, url: offer.url, source: offer.source }),
      "utf8",
    );
    const merged = await run("merge-tracker", []);
    outcome = merged.ok ? "added" : "failed";
  } finally {
    // Un ajout qui n'a pas été fusionné ne doit pas rester en attente pour une prochaine fusion.
    if (outcome !== "added") fs.rmSync(tsv, { force: true });
    await run("reserve-report-num", ["--release", num]);
  }
  return { outcome, n: outcome === "added" ? String(Number(num)) : undefined };
}
