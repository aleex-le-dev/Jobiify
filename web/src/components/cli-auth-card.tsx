"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, Terminal, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/cn";

type CliAuthCardProps = {
  cliId: string;
  cliName?: string;
  onSuccess?: () => void;
  onLogout?: () => void;
  className?: string;
  compact?: boolean;
};

type AuthStatus = {
  loading: boolean;
  authenticated: boolean;
  installed: boolean;
  user?: string | null;
  message?: string;
  error?: string | null;
  activeSession?: boolean;
  authUrl?: string | null;
};

export function CliAuthCard({
  cliId,
  cliName = "Codex",
  onSuccess,
  onLogout,
  className,
  compact = false,
}: CliAuthCardProps) {
  const [status, setStatus] = useState<AuthStatus>({
    loading: true,
    authenticated: false,
    installed: true,
  });
  const [connecting, setConnecting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const pollTimer = useRef<NodeJS.Timeout | null>(null);
  const wasUnauthenticatedRef = useRef(false);
  const isFirstCheckRef = useRef(true);

  // Check auth status
  async function checkStatus() {
    try {
      const res = await fetch(`/api/clis/auth?cli=${encodeURIComponent(cliId)}`);
      if (!res.ok) throw new Error("Impossible de vérifier le statut");
      const data = await res.json();
      const isAuth = !!data.authenticated;
      const isFirst = isFirstCheckRef.current;
      isFirstCheckRef.current = false;

      setStatus({
        loading: false,
        authenticated: isAuth,
        installed: data.installed !== false,
        user: data.user,
        message: data.message,
        activeSession: data.activeSession,
        authUrl: data.authUrl,
      });

      if (isAuth) {
        setConnecting(false);
        setAuthUrl(null);
        stopPolling();
        // Ne déclencher onSuccess que si c'est une connexion nouvellement acquise
        if (!isFirst && (connecting || wasUnauthenticatedRef.current)) {
          wasUnauthenticatedRef.current = false;
          onSuccess?.();
        }
      } else {
        wasUnauthenticatedRef.current = true;
        if (data.activeSession && data.authUrl) {
          setAuthUrl(data.authUrl);
        }
      }
    } catch (e) {
      setStatus((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : "Erreur de statut",
      }));
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer.current = setInterval(checkStatus, 1500);
  }

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  useEffect(() => {
    checkStatus();
    const onFocus = () => checkStatus();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      stopPolling();
    };
  }, [cliId]);

  // Launch 1-click browser login
  async function handleOneClickLogin() {
    setConnecting(true);
    wasUnauthenticatedRef.current = true;
    setStepError(null);
    try {
      const res = await fetch("/api/clis/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cli: cliId, action: "start" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec du lancement de la connexion");

      if (data.authenticated) {
        setStatus((prev) => ({ ...prev, authenticated: true, user: data.user }));
        setConnecting(false);
        wasUnauthenticatedRef.current = false;
        onSuccess?.();
        return;
      }

      if (data.authUrl) {
        setAuthUrl(data.authUrl);
        // Try opening in new tab
        const win = window.open(data.authUrl, "_blank");
        if (!win) {
          // Popup blocked
          setStepError("Le navigateur a bloqué l'ouverture automatique. Cliquez sur le lien ci-dessous pour ouvrir la page.");
        }
      }

      startPolling();
    } catch (e) {
      setStepError(e instanceof Error ? e.message : "Erreur lors de la connexion");
      setConnecting(false);
    }
  }

  // Launch terminal login window
  async function handleTerminalLogin() {
    try {
      await fetch("/api/clis/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cli: cliId, action: "terminal" }),
      });
      setConnecting(true);
      startPolling();
    } catch {
      /* ignore */
    }
  }

  // Cancel ongoing login
  async function handleCancel() {
    stopPolling();
    setConnecting(false);
    setAuthUrl(null);
    setStepError(null);
    try {
      await fetch("/api/clis/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cli: cliId, action: "cancel" }),
      });
      checkStatus();
    } catch {
      /* ignore */
    }
  }

  // Logout
  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/clis/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cli: cliId, action: "logout" }),
      });
      setStatus((prev) => ({ ...prev, authenticated: false, user: null }));
      onLogout?.();
    } catch {
      /* ignore */
    } finally {
      setLoggingOut(false);
    }
  }

  if (status.loading) {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted py-2", className)}>
        <Loader2 className="size-3.5 animate-spin" /> Vérification de la connexion {cliName}…
      </div>
    );
  }

  // Already authenticated
  if (status.authenticated) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-300",
          className,
        )}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
          <span>
            <strong>{cliName} est connecté</strong>
            {status.user ? ` (${status.user})` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-muted hover:text-rose-600 dark:hover:text-rose-400 hover:underline shrink-0 font-medium transition-colors"
          >
            {loggingOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
        </div>
      </div>
    );
  }

  // Active connecting state (browser waiting)
  if (connecting) {
    return (
      <div
        className={cn(
          "space-y-3 rounded-xl border border-brand/40 bg-brand-soft p-4 text-xs shadow-sm",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Loader2 className="size-4 animate-spin text-brand" />
            <span>Connexion à {cliName} en cours…</span>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
            title="Annuler"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <p className="text-muted leading-relaxed">
          Une fenêtre de connexion OpenAI s'est ouverte dans votre navigateur. Cliquez sur{" "}
          <strong className="text-foreground">« Autoriser »</strong> ou connectez-vous avec votre compte ChatGPT.
        </p>

        {authUrl && (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={authUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 font-medium text-brand-foreground shadow-sm hover:bg-brand-200 transition-colors"
            >
              Ouvrir la page de connexion OpenAI <ExternalLink className="size-3" />
            </a>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
            >
              Annuler
            </button>
          </div>
        )}

        {stepError && (
          <p className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <AlertCircle className="size-3.5 shrink-0" /> {stepError}
          </p>
        )}
      </div>
    );
  }

  // Not authenticated
  return (
    <div
      className={cn(
        "rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-foreground space-y-2.5",
        compact && "p-3 space-y-2",
        className,
      )}
    >
      <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
        <AlertCircle className="size-4 shrink-0" />
        <span>{cliName} n'est pas encore connecté</span>
      </div>

      <p className="text-muted leading-relaxed">
        Pour que l'assistant fonctionne, votre compte doit être connecté. Cliquez sur le bouton ci-dessous pour lancer la connexion automatique en 1 clic.
      </p>

      {stepError && (
        <p className="text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
          <AlertCircle className="size-3.5 shrink-0" /> {stepError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={handleOneClickLogin}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 font-medium text-brand-foreground shadow hover:bg-brand-200 transition-colors"
        >
          <Sparkles className="size-3.5" />
          Se connecter à {cliName} en 1 clic
        </button>

        <button
          type="button"
          onClick={handleTerminalLogin}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface/80 px-2.5 py-2 text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
          title="Ouvrir une fenêtre de commande Windows pour exécuter codex login"
        >
          <Terminal className="size-3" />
          Ouvrir dans le terminal
        </button>
      </div>
    </div>
  );
}
