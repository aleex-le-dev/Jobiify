import { execFile, spawn, type ChildProcess } from "node:child_process";
import { NextResponse } from "next/server";
import { resolveCli } from "@/lib/clis";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessionState = {
  cli: string;
  child: ChildProcess;
  authUrl: string | null;
  status: "starting" | "waiting_for_browser" | "success" | "error";
  error: string | null;
  user: string | null;
  startedAt: number;
};

// Global in-memory session tracking for active login processes
let activeSession: SessionState | null = null;

function checkCodexStatus(binPath: string): Promise<{ authenticated: boolean; user: string | null; raw: string }> {
  return new Promise((resolve) => {
    execFile(binPath, ["login", "status"], { shell: true, timeout: 5000 }, (err, stdout, stderr) => {
      const out = (stdout || "").trim();
      const errOut = (stderr || "").trim();
      const combined = `${out}\n${errOut}`.trim();
      if (!err && out.toLowerCase().includes("logged in")) {
        // e.g. "Logged in as alex@example.com"
        const match = out.match(/logged in as\s+([^\r\n]+)/i);
        resolve({ authenticated: true, user: match ? match[1].trim() : null, raw: out });
      } else if (!err && !errOut.toLowerCase().includes("not logged in") && out) {
        resolve({ authenticated: true, user: null, raw: out });
      } else {
        resolve({ authenticated: false, user: null, raw: combined });
      }
    });
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cli = searchParams.get("cli") || "codex";

  const resolved = resolveCli(cli);
  if (!resolved) {
    return NextResponse.json({ authenticated: false, installed: false, error: `CLI '${cli}' non installé` }, { status: 404 });
  }

  // Handle Codex specifically
  if (cli === "codex") {
    // If active session reported success, verify with real status
    const status = await checkCodexStatus(resolved.binPath);
    if (status.authenticated) {
      if (activeSession && activeSession.cli === "codex") {
        try { activeSession.child.kill(); } catch { /* ignore */ }
        activeSession = null;
      }
      return NextResponse.json({
        authenticated: true,
        installed: true,
        user: status.user,
        message: status.raw,
      });
    }

    // Check if an ongoing login session is active
    if (activeSession && activeSession.cli === "codex") {
      // Check for timeout (> 5 minutes)
      if (Date.now() - activeSession.startedAt > 300_000) {
        try { activeSession.child.kill(); } catch { /* ignore */ }
        activeSession = null;
        return NextResponse.json({ authenticated: false, installed: true, activeSession: false });
      }

      return NextResponse.json({
        authenticated: false,
        installed: true,
        activeSession: true,
        status: activeSession.status,
        authUrl: activeSession.authUrl,
        error: activeSession.error,
      });
    }

    return NextResponse.json({
      authenticated: false,
      installed: true,
      activeSession: false,
      message: status.raw,
    });
  }

  // Other CLIs default to assumed authenticated if installed
  return NextResponse.json({ authenticated: true, installed: true });
}

export async function POST(req: Request) {
  const body = await readJsonObject<{ cli?: string; action?: "start" | "cancel" | "terminal" }>(req);
  const cli = body?.cli || "codex";
  const action = body?.action || "start";

  const resolved = resolveCli(cli);
  if (!resolved) {
    return NextResponse.json({ error: `CLI '${cli}' non installé sur cet ordinateur` }, { status: 404 });
  }

  if (action === "cancel") {
    if (activeSession && activeSession.cli === cli) {
      try { activeSession.child.kill(); } catch { /* ignore */ }
      activeSession = null;
    }
    return NextResponse.json({ success: true, cancelled: true });
  }

  if (action === "terminal") {
    if (process.platform === "win32") {
      try {
        spawn("cmd.exe", ["/c", "start", "cmd.exe", "/k", `${resolved.spec.bin} login`], {
          shell: true,
          detached: true,
          stdio: "ignore",
        });
        return NextResponse.json({ success: true, terminal: true });
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur terminal" }, { status: 500 });
      }
    }
    return NextResponse.json({ error: "L'ouverture directe du terminal n'est supportée que sous Windows" }, { status: 400 });
  }

  // Action: "start"
  if (cli === "codex") {
    // 1. Check if already logged in
    const current = await checkCodexStatus(resolved.binPath);
    if (current.authenticated) {
      return NextResponse.json({
        authenticated: true,
        user: current.user,
        message: current.raw,
      });
    }

    // 2. If a session is already waiting with authUrl, return it immediately
    if (activeSession && activeSession.cli === "codex" && activeSession.authUrl) {
      return NextResponse.json({
        authenticated: false,
        activeSession: true,
        authUrl: activeSession.authUrl,
        status: activeSession.status,
      });
    }

    // Kill any stale session
    if (activeSession) {
      try { activeSession.child.kill(); } catch { /* ignore */ }
      activeSession = null;
    }

    // 3. Launch `codex login`
    const child = spawn(resolved.binPath, ["login"], { shell: true });

    const session: SessionState = {
      cli: "codex",
      child,
      authUrl: null,
      status: "starting",
      error: null,
      user: null,
      startedAt: Date.now(),
    };
    activeSession = session;

    // Capture auth URL from stdout / stderr
    const authUrlPromise = new Promise<string | null>((resolve) => {
      let resolvedUrl = false;

      function onData(chunk: Buffer) {
        const text = chunk.toString();
        // Look for auth URL
        const match = text.match(/https:\/\/auth\.openai\.com\/oauth\/authorize[^\s\r\n]+/);
        if (match && !resolvedUrl) {
          resolvedUrl = true;
          session.authUrl = match[0];
          session.status = "waiting_for_browser";
          resolve(match[0]);
        }
      }

      child.stdout.on("data", onData);
      child.stderr.on("data", onData);

      child.on("close", (code) => {
        if (activeSession?.child === child) {
          if (code === 0) {
            activeSession.status = "success";
          } else {
            activeSession.status = "error";
            activeSession.error = "La commande de connexion s'est terminée avec une erreur.";
          }
        }
        if (!resolvedUrl) resolve(null);
      });

      child.on("error", (err) => {
        if (activeSession?.child === child) {
          activeSession.status = "error";
          activeSession.error = err.message;
        }
        if (!resolvedUrl) resolve(null);
      });

      // Timeout after 6 seconds if no URL found
      setTimeout(() => {
        if (!resolvedUrl) resolve(null);
      }, 6000);
    });

    const authUrl = await authUrlPromise;

    return NextResponse.json({
      authenticated: false,
      activeSession: true,
      authUrl,
      status: session.status,
    });
  }

  return NextResponse.json({ authenticated: true });
}
