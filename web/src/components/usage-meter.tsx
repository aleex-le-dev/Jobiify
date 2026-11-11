"use client";

import { useEffect, useState } from "react";
import { Gauge, Settings2, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

type QuotaWindow = { percent: number; resetsAt: number | null; status: string | null };
type Usage = {
  window5h: { tokens: number; messages?: number };
  window7d: { tokens: number; messages?: number };
  /** Quota réel du compte Claude (null si indisponible). */
  real?: { fiveHour: QuotaWindow | null; sevenDay: QuotaWindow | null } | null;
  realCheckedAt?: number | null;
};

/** « dans 2 h 05 », « mar. 14:00 »… */
function resetLabel(at: number | null): string {
  if (!at) return "";
  const ms = at - Date.now();
  if (ms <= 0) return "réinitialisé";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `dans ${min} min`;
  if (min < 24 * 60) return `dans ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
  return new Date(at).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function RealQuota({ real, checkedAt }: { real: NonNullable<Usage["real"]>; checkedAt: number | null }) {
  const rows = [
    { label: "5 h", full: "Session (5 heures glissantes)", w: real.fiveHour },
    { label: "7 j", full: "Semaine (7 jours glissants)", w: real.sevenDay },
  ].filter((r) => r.w);
  const when = checkedAt ? new Date(checkedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className="space-y-2.5 px-1">
      {rows.map(({ label, full, w }) => {
        const pct = Math.min(100, Math.round(w!.percent));
        return (
          <div
            key={label}
            title={`${full} : ${w!.percent} % du quota de votre compte utilisé${w!.resetsAt ? `
Réinitialisation : ${new Date(w!.resetsAt).toLocaleString("fr-FR")}` : ""}`}
            className="cursor-default"
          >
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-faint">{label}</span>
              <span className="font-mono text-[10px] font-semibold tabular-nums text-foreground">{pct} %</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
              <div className={cn("h-full rounded-full transition-all duration-500", tone(pct))} style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
            <div className="mt-0.5 flex items-center justify-between text-[9px] text-faint">
              <span>Reste {100 - pct} %</span>
              <span>{resetLabel(w!.resetsAt)}</span>
            </div>
          </div>
        );
      })}
      <p className="flex items-center gap-1 text-[9px] text-faint">
        <span className="live-dot inline-block size-1.5 rounded-full bg-emerald-500" /> Quota réel du compte{when ? ` · mis à jour ${when}` : ""}
      </p>
    </div>
  );
}

// Budgets par défaut selon le CLI utilisé :
// - Claude Code compte massivement les cache reads (jusqu'à des dizaines de millions par session).
// - Codex / autres CLI comptent les tokens réels (prompt + complétion, typiquement de quelques centaines de k à quelques M).
const CLAUDE_DEFAULT_BUDGET = { w5: 140_000_000, w7: 1_000_000_000 };
const CODEX_DEFAULT_BUDGET = { w5: 2_500_000, w7: 15_000_000 };

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} k`;
  return `${n}`;
}

function tone(pct: number): string {
  if (pct >= 85) return "bg-red-500";
  if (pct >= 60) return "bg-amber-500";
  return "bg-emerald-500";
}

export function UsageMeter() {
  const [data, setData] = useState<Usage | null>(null);
  const [cli, setCli] = useState<string | null>(null);
  const [budget, setBudget] = useState(CODEX_DEFAULT_BUDGET);
  const [showConfig, setShowConfig] = useState(false);
  const [customW7, setCustomW7] = useState("");

  useEffect(() => {
    try {
      const cfg = localStorage.getItem("career-ops:config");
      const currentCli = cfg ? JSON.parse(cfg).cliId || null : null;
      setCli(currentCli);

      const defaultB = currentCli === "claude" ? CLAUDE_DEFAULT_BUDGET : CODEX_DEFAULT_BUDGET;
      const b = localStorage.getItem("career-ops:usage-budget");
      if (b) {
        setBudget({ ...defaultB, ...JSON.parse(b) });
      } else {
        setBudget(defaultB);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/usage")
        .then((r) => r.json())
        .then((d) => {
          if (alive) setData(d);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const saveBudget = () => {
    const val = parseFloat(customW7);
    if (!Number.isNaN(val) && val > 0) {
      // Si la valeur saisie est en millions (ex: 15 pour 15M) ou brute
      const w7Val = val < 1000 ? Math.round(val * 1_000_000) : Math.round(val);
      const w5Val = Math.round(w7Val * 0.2); // 20% sur 5h
      const updated = { w5: w5Val, w7: w7Val };
      setBudget(updated);
      try {
        localStorage.setItem("career-ops:usage-budget", JSON.stringify(updated));
      } catch {}
    }
    setShowConfig(false);
  };

  const rows = [
    {
      label: "5 h",
      fullLabel: "les 5 dernières heures",
      tokens: data?.window5h?.tokens ?? 0,
      budget: budget.w5,
    },
    {
      label: "7 j",
      fullLabel: "les 7 derniers jours",
      tokens: data?.window7d?.tokens ?? 0,
      budget: budget.w7,
    },
  ];

  return (
    <div className="border-t border-border pt-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">
          <Gauge className="size-3 text-brand" /> Quota IA
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase text-faint">
            {data?.real ? "Claude" : cli === "claude" ? "Claude" : cli === "codex" ? "Codex" : "IA"}
          </span>
          {!data?.real && <button
            type="button"
            onClick={() => {
              setCustomW7((budget.w7 / 1_000_000).toString());
              setShowConfig(!showConfig);
            }}
            title="Ajuster le plafond de jetons"
            className="rounded p-0.5 text-faint hover:bg-surface-hover hover:text-foreground transition-colors"
          >
            <Settings2 className="size-2.5" />
          </button>}
        </div>
      </div>

      {data?.real ? (
        <RealQuota real={data.real} checkedAt={data.realCheckedAt ?? null} />
      ) : (
      <>
      {showConfig && (
        <div className="mb-2 rounded-md border border-border bg-surface p-2 text-[11px] shadow-sm">
          <div className="mb-1 font-medium text-foreground flex items-center justify-between">
            <span>Plafond 7 jours</span>
            <button
              type="button"
              onClick={() => setShowConfig(false)}
              className="text-faint hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <input
              type="number"
              step="1"
              min="1"
              value={customW7}
              onChange={(e) => setCustomW7(e.target.value)}
              placeholder="Ex: 15"
              className="w-full rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-mono text-foreground focus:border-brand focus:outline-none"
            />
            <span className="text-[10px] text-faint font-medium">M</span>
            <button
              type="button"
              onClick={saveBudget}
              className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-brand/90 transition-colors"
              title="Valider"
            >
              <Check className="size-3" />
            </button>
          </div>
          <p className="mt-1 text-[9px] text-faint leading-tight">
            Ex: 15 pour 15 millions de jetons sur 7 jours.
          </p>
        </div>
      )}

      <div className="space-y-2.5 px-1">
        {rows.map((r) => {
          const pct = Math.min(100, Math.round((r.tokens / r.budget) * 100));
          const remaining = Math.max(0, r.budget - r.tokens);
          const tooltip = `Sur ${r.fullLabel} :\n• Dépensé : ${r.tokens.toLocaleString("fr-FR")} jetons (${pct}%)\n• Restant : ${remaining.toLocaleString("fr-FR")} jetons (${100 - pct}%)\n• Plafond : ${r.budget.toLocaleString("fr-FR")} jetons`;

          return (
            <div key={r.label} title={tooltip} className="group cursor-default">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-medium text-faint">{r.label}</span>
                <span className="tabular-nums font-mono text-[10px]">
                  <span className="text-foreground font-semibold">{fmt(r.tokens)}</span>
                  <span className="text-faint"> / {fmt(r.budget)}</span>
                  <span className="text-faint ml-1">({pct}%)</span>
                </span>
              </div>

              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
                <div
                  className={cn("h-full rounded-full transition-all duration-300", tone(pct))}
                  style={{ width: `${Math.max(pct, r.tokens > 0 ? 3 : 0)}%` }}
                />
              </div>

              <div className="mt-0.5 flex items-center justify-between text-[9px] text-faint">
                <span>Reste : {fmt(remaining)}</span>
                <span>{100 - pct}% dispo</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 px-1 text-[9px] leading-tight text-faint">Estimation locale (jetons comptés dans les journaux), le quota réel n'a pas pu être lu.</p>
      </>
      )}
    </div>
  );
}
