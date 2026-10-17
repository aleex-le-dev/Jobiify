import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";
import type { DiscoveredOffer } from "./scan";

/**
 * "Add to pipeline" — appends user-selected discovered offers to data/pipeline.md
 * AND records them in data/scan-history.tsv (so future scans dedup them). We reuse
 * the CANONICAL writers exported by the core's scan.mjs (`appendToPipeline`,
 * `appendToScanHistory`) instead of re-implementing the line format / section
 * markers — single source of truth, per the web↔core contract. We invoke them in
 * a short-lived node process (cwd = the user's career-ops root) so the core's own
 * code does the writing; the web never owns a parallel copy of that logic.
 *
 * Discovered-but-not-added offers stay "new" (a dry-run scan writes nothing);
 * only an explicit add records them as seen. No tokens are spent here.
 */
export type AddResult = { added: number; error?: string };

export function addOffersToPipeline(offers: DiscoveredOffer[]): Promise<AddResult> {
  const clean = offers
    .filter((o) => o && typeof o.url === "string" && /^https?:\/\//i.test(o.url))
    .map((o) => {
      const parsedTime = o.postedAt ? Date.parse(o.postedAt) : NaN;
      return {
        url: o.url,
        company: o.company || "",
        title: o.title || "",
        location: o.location || "",
        source: o.source || o.ats || "explorer",
        postedAt: Number.isFinite(parsedTime) && parsedTime > 0 ? parsedTime : undefined,
        note: o.note || "",
      };
    });
  if (clean.length === 0) return Promise.resolve({ added: 0 });

  // Data-only / pre-scan-ats checkout has no scan.mjs writers → fail with an
  // actionable message instead of a silent added:0.
  if (!fs.existsSync(rootScript("scan"))) {
    return Promise.resolve({ added: 0, error: "This checkout is data-only — the pipeline writer (scan.mjs) isn't available." });
  }

  const scanUrl = pathToFileURL(rootScript("scan")).href;
  const localTodayUrl = pathToFileURL(path.join(careerOpsRoot(), "lib", "local-today.mjs")).href;
  const code = `
import { appendToPipeline, appendToScanHistory } from ${JSON.stringify(scanUrl)};
import { localToday } from ${JSON.stringify(localTodayUrl)};
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { input += d; });
process.stdin.on("end", async () => {
  try {
    const offers = JSON.parse(input);
    const date = localToday();
    await appendToPipeline(offers);
    await appendToScanHistory(offers, date, "added");
    process.stdout.write(JSON.stringify({ added: offers.length }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ added: 0, error: String((e && e.message) || e) }));
  }
});
`;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      cwd: careerOpsRoot(),
      env: process.env,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", (e) => resolve({ added: 0, error: e instanceof Error ? e.message : "spawn failed" }));
    child.on("close", () => {
      try {
        const parsed = JSON.parse(out.trim() || "{}") as AddResult;
        resolve({ added: parsed.added ?? 0, error: parsed.error });
      } catch {
        resolve({ added: 0, error: err.trim().slice(0, 200) || "writer returned no result" });
      }
    });
    child.stdin.write(JSON.stringify(clean));
    child.stdin.end();
  });
}

export type RemoveResult = { removed: number; error?: string };

export async function removeOffersFromPipeline(urls: string[]): Promise<RemoveResult> {
  const cleanUrls = urls
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter((u) => /^https?:\/\//i.test(u));

  if (cleanUrls.length === 0) return { removed: 0 };

  const pipelinePath = path.join(careerOpsRoot(), "data", "pipeline.md");
  if (!fs.existsSync(pipelinePath)) return { removed: 0 };

  const lockModule = path.join(careerOpsRoot(), "pipeline-lock.mjs");

  const run = () => {
    let md = fs.readFileSync(pipelinePath, "utf8");
    const nl = md.includes("\r\n") ? "\r\n" : "\n";
    const lines = md.split(/\r?\n/);
    let removed = 0;
    const kept = lines.filter((line) => {
      const isCheckbox = /^\s*-\s*\[([ xX])\]/.test(line);
      if (!isCheckbox) return true;
      const match = cleanUrls.some((u) => line.includes(u));
      if (match) {
        removed++;
        return false;
      }
      return true;
    });

    if (removed > 0) {
      fs.writeFileSync(pipelinePath, kept.join(nl), "utf8");
    }
    return { removed };
  };

  if (!fs.existsSync(lockModule)) {
    return run();
  }

  try {
    const mod = await import(pathToFileURL(lockModule).href);
    if (typeof mod.withPipelineLock === "function") {
      return await mod.withPipelineLock(pipelinePath, run, { timeoutMs: 5000, retryMs: 50 });
    }
  } catch {
    /* fallback to plain run */
  }
  return run();
}
