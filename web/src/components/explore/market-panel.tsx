"use client";

import { useState } from "react";
import { BarChart3, Check, ChevronDown, Loader2, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { cleanChips } from "@/lib/explore";
import { useExplore } from "./explore-provider";

type Metier = { key: string; label: string; count: number; inProfile: boolean; examples: string[]; sources: Record<string, number> };
type Market = {
  ville: string;
  minutes: number;
  total: number;
  profile: string | null;
  profileMatch: { count: number; examples: string[] };
  metiers: Metier[];
  sources: Array<{ id: string; label: string; count: number; ok: boolean }>;
  error?: string;
};

/**
 * « Où sont les offres dans votre zone ? » : analyse à la demande (gratuite, sans clé,
 * sans jeton) de toutes les offres de la zone, par métier, comparées aux postes visés du profil.
 */
export function MarketPanel() {
  const { filters, setFilters, discover, running } = useExplore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [market, setMarket] = useState<Market | null>(null);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const [adding, setAdding] = useState<string | null>(null);

  async function analyse() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/explore/market", { cache: "no-store" });
      const data = (await res.json()) as Market;
      if (!res.ok) throw new Error(data.error || "analyse impossible");
      setMarket(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "analyse impossible");
    } finally {
      setLoading(false);
    }
  }

  async function addToProfile(m: Metier) {
    const title = m.examples[0];
    if (!title) return;
    setAdding(m.key);
    try {
      const res = await fetch("/api/explore/profile-title", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      const data = (await res.json()) as { titles?: string[]; synonyms?: string[]; error?: string };
      if (!res.ok || !data.titles) throw new Error(data.error || "ajout impossible");
      // Même construction que les filtres d'un profil : postes visés + synonymes.
      setFilters({ ...filters, positive: cleanChips([...data.titles, ...(data.synonyms ?? [])]) });
      setAdded((a) => [...a, m.key]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ajout impossible");
    } finally {
      setAdding(null);
    }
  }

  const max = Math.max(1, ...(market?.metiers.map((m) => m.count) ?? [1]));

  return (
    <section className="mb-6 rounded-xl border border-border bg-surface/30" aria-labelledby="market-title">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && !market && !loading) void analyse();
        }}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left max-sm:min-h-11"
      >
        <BarChart3 className="size-4.5 text-brand" />
        <span id="market-title" className="text-sm font-semibold text-foreground">Où sont les offres dans votre zone ?</span>
        <span className="text-[12.5px] text-muted">Tous les métiers, comparés à vos postes visés</span>
        <ChevronDown className={cn("ml-auto size-4 text-muted transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          {loading && (
            <p className="flex items-center gap-2 text-[13px] text-muted" role="status">
              <Loader2 className="size-4 animate-spin" /> Analyse des offres de la zone (intérim, fonction publique, Meteojob)…
            </p>
          )}
          {error && (
            <p className="text-[13px] text-rose-700 dark:text-rose-300">
              {error}{" "}
              <button type="button" onClick={() => void analyse()} className="font-medium underline">Réessayer</button>
            </p>
          )}

          {market && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted">
                <span>
                  <span className="font-semibold tabular-nums text-foreground">{market.total.toLocaleString("fr-FR")}</span> offres analysées dans les {market.minutes} min autour de {market.ville}
                </span>
                {market.sources.map((s) => (
                  <span key={s.id} className={cn(!s.ok && "text-rose-700 dark:text-rose-300")}>
                    {s.label} : {s.ok ? s.count : "indisponible"}
                  </span>
                ))}
              </div>

              <div className="rounded-lg border border-brand/30 bg-brand-soft/30 px-3.5 py-3">
                <p className="text-sm text-foreground">
                  <span className="font-semibold">Vos postes visés{market.profile ? ` (${market.profile})` : ""} :</span>{" "}
                  <span className="font-semibold tabular-nums">{market.profileMatch.count}</span> offre{market.profileMatch.count > 1 ? "s" : ""}
                </p>
                {market.profileMatch.examples.length > 0 && <p className="mt-0.5 text-[12.5px] text-muted">Par exemple : {market.profileMatch.examples.join(" · ")}</p>}
                {market.metiers[0] && market.profileMatch.count * 4 < market.metiers[0].count && (
                  <p className="mt-1.5 text-[13px] text-foreground">
                    Les métiers ci-dessous ont beaucoup plus d&apos;offres que le vôtre dans cette zone : à envisager si vous êtes ouvert à un métier voisin.
                  </p>
                )}
              </div>

              <ul className="space-y-2.5" aria-label="Métiers par nombre d'offres">
                {market.metiers.map((m) => {
                  const done = added.includes(m.key);
                  return (
                    <li key={m.key} className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="truncate text-[13.5px] font-medium text-foreground" title={m.examples.join(" · ")}>{m.label}</span>
                          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">{m.count}</span>
                          {m.inProfile && <span className="shrink-0 rounded-md border border-brand/30 bg-brand-soft px-1.5 py-0.5 text-[11px] font-medium text-brand">Dans votre profil</span>}
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border/60" aria-hidden="true">
                          <div className={cn("h-full rounded-full", m.inProfile ? "bg-brand" : "bg-brand/45")} style={{ width: `${Math.max(3, Math.round((m.count / max) * 100))}%` }} />
                        </div>
                        <p className="mt-1 truncate text-[12px] text-faint">{m.examples.join(" · ")}</p>
                      </div>
                      {!m.inProfile && m.examples[0] && (
                        <button
                          type="button"
                          disabled={done || adding === m.key}
                          onClick={() => void addToProfile(m)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-60 max-sm:min-h-11"
                        >
                          {done ? <Check className="size-3.5 text-emerald-500" /> : adding === m.key ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                          <span className="max-w-[15rem] truncate">{done ? "Ajouté au profil" : `Ajouter « ${m.examples[0]} »`}</span>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {added.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-[13px] text-emerald-900 dark:text-emerald-100">
                  <span>{added.length > 1 ? "Métiers ajoutés" : "Métier ajouté"} à votre profil, avec leurs synonymes. Relancez la recherche pour voir les offres.</span>
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => void discover()}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground transition hover:brightness-110 disabled:opacity-50 max-sm:min-h-11"
                  >
                    <RotateCcw className="size-3.5" /> Relancer la recherche
                  </button>
                </div>
              )}

              <p className="text-[12px] leading-relaxed text-faint">
                Échantillon du marché local : agences d&apos;intérim, fonction publique et offres récentes de Meteojob. Les chiffres comparent les métiers entre eux, ils ne comptent pas toutes les offres de la zone.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
