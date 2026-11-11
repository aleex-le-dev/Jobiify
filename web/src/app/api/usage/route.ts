import { NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { claudeUsageTokens } from "@/lib/claude-usage.mjs";
import { quotaFromStream, type ClaudeQuota } from "@/lib/claude-quota.mjs";
import { resolveCli } from "@/lib/clis";
import { spawnHeadlessCli } from "@/lib/spawn-cli.mjs";
import { CAPS } from "@/lib/worker-capabilities.mjs";
import { scopeFrom } from "@/lib/claude-invocation.mjs";

// Sonde sans écriture ni réseau : le cadrage exige une liste d'interdits explicite.
const PROBE_SCOPE = scopeFrom("Read");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reads Claude Code's per-message usage across ALL projects (~/.claude/projects/
// **/*.jsonl) and sums tokens in the rolling 5h and 7d windows — the same scope
// as the account's rate-limit windows. Cached 60s (the read is heavy).

type Usage = { window5h: { tokens: number; messages: number }; window7d: { tokens: number; messages: number }; computedAt: number };
let cache: { at: number; data: Usage } | null = null;

function projectsDir(): string {
  return path.join(os.homedir(), ".claude", "projects");
}

function codexSessionsDir(): string {
  return path.join(os.homedir(), ".codex", "sessions");
}

function* walkJsonl(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkJsonl(p);
    else if (e.isFile() && e.name.endsWith(".jsonl")) yield p;
  }
}

function compute(): Usage {
  const now = Date.now();
  const w5 = now - 5 * 3600 * 1000;
  const w7 = now - 7 * 24 * 3600 * 1000;
  const cutoffMtime = w7 - 3600 * 1000;
  let t5 = 0;
  let t7 = 0;
  let m5 = 0;
  let m7 = 0;

  // 1. Claude Code per-message logs (~/.claude/projects/**/*.jsonl)
  for (const file of walkJsonl(projectsDir())) {
    let st: fs.Stats;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    if (st.mtimeMs < cutoffMtime) continue;
    let content: string;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      if (!line.includes('"usage"')) continue;
      let d: { message?: { usage?: Record<string, number> }; timestamp?: string };
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }
      const u = d.message?.usage;
      const ts = d.timestamp ? Date.parse(d.timestamp) : NaN;
      if (!u || Number.isNaN(ts) || ts < w7) continue;
      const tok = claudeUsageTokens(u);
      t7 += tok;
      m7 += 1;
      if (ts >= w5) {
        t5 += tok;
        m5 += 1;
      }
    }
  }

  // 2. Codex per-turn logs (~/.codex/sessions/**/*.jsonl)
  for (const file of walkJsonl(codexSessionsDir())) {
    let st: fs.Stats;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    if (st.mtimeMs < cutoffMtime) continue;
    let content: string;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split("\n")) {
      if (!line.includes('"usage"')) continue;
      let d: {
        payload?: { usage?: Record<string, number>; timestamp?: string };
        usage?: Record<string, number>;
        timestamp?: string;
      };
      try {
        d = JSON.parse(line);
      } catch {
        continue;
      }
      const u = d.payload?.usage || d.usage;
      const rawTs = d.timestamp || d.payload?.timestamp;
      const ts = rawTs ? Date.parse(rawTs) : NaN;
      if (!u || Number.isNaN(ts) || ts < w7) continue;
      const tok =
        typeof u.total_tokens === "number" && u.total_tokens > 0
          ? u.total_tokens
          : (u.input_tokens || 0) + (u.output_tokens || 0);
      if (tok <= 0) continue;
      t7 += tok;
      m7 += 1;
      if (ts >= w5) {
        t5 += tok;
        m5 += 1;
      }
    }
  }

  return { window5h: { tokens: t5, messages: m5 }, window7d: { tokens: t7, messages: m7 }, computedAt: now };
}

// Quota RÉEL du compte : un appel minimal à Claude (Haiku, sans outils ni
// contexte) renvoie l'événement rate_limit_event avec le % consommé sur 5 h et
// 7 j, comme la commande /usage. Au plus un appel toutes les 3 minutes.
const REAL_TTL = 3 * 60_000;
let real: { at: number; data: ClaudeQuota | null } | null = null;
let probing: Promise<ClaudeQuota | null> | null = null;

function probeClaudeQuota(): Promise<ClaudeQuota | null> {
  const resolved = resolveCli("claude");
  if (!resolved) return Promise.resolve(null);
  return new Promise((resolve) => {
    let out = "";
    let child: ReturnType<typeof spawnHeadlessCli>;
    try {
      child = spawnHeadlessCli(
        resolved.binPath,
        ["-p", "ok", "--output-format", "stream-json", "--verbose", "--model", "haiku", "--system-prompt", "Réponds ok.",
          "--strict-mcp-config", "--allowedTools", PROBE_SCOPE.allowed, "--disallowedTools", PROBE_SCOPE.disallowed, "--no-session-persistence", "--setting-sources", ""],
        { cwd: os.homedir(), env: process.env },
        { cliId: "claude", capabilities: CAPS.localReadOnly },
      );
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => child.kill(), 30_000);
    child.stdout?.on("data", (b: Buffer) => {
      out += b.toString("utf8");
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(quotaFromStream(out));
    });
  });
}

async function realQuota(): Promise<{ quota: ClaudeQuota | null; checkedAt: number | null }> {
  if (real && Date.now() - real.at < REAL_TTL) return { quota: real.data, checkedAt: real.at };
  probing ??= probeClaudeQuota().finally(() => {
    probing = null;
  });
  const data = await probing;
  // Échec : on garde la dernière valeur connue plutôt que de l'effacer.
  if (data || !real) real = { at: Date.now(), data: data ?? real?.data ?? null };
  return { quota: real.data, checkedAt: real.data ? real.at : null };
}

export async function GET() {
  if (!cache || Date.now() - cache.at >= 60_000) cache = { at: Date.now(), data: compute() };
  const { quota, checkedAt } = await realQuota();
  return NextResponse.json({ ...cache.data, real: quota, realCheckedAt: checkedAt });
}
