"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  Check,
  CircleCheck,
  CircleDashed,
  HardHat,
  KeyRound,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { displayFont } from "@/lib/fonts";
import type { DiscoveredOffer } from "@/lib/explore";

type Offer = { url: string; title: string; agency: string; company: string; location: string; postedAt: string; source: string };
type Source = { id: string; label: string; status: "ok" | "needs-key" | "error"; count: number };
type Payload = { offers: Offer[]; sources: Source[]; ville: string; minutes: number; error?: string };

const PAGE = 60;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Intitulé « métier » regroupable : sans (H/F), sans précision après un tiret. */
const metier = (title: string) =>
  title
    .replace(/\((h\/f|f\/h|h\/f\/x|f\/h\/x)\)/gi, "")
    .split(/\s+[-–—|]\s+/)[0]
    .replace(/\s+/g, " ")
    .trim();

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = Math.floor((Date.now() - t) / 86_400_000);
  if (d <= 0) return "aujourd'hui";
  if (d === 1) return "hier";
  if (d < 30) return `il y a ${d} j`;
  return `il y a ${Math.floor(d / 30)} mois`;
}

function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function InterimView() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [agency, setAgency] = useState<string | null>(null);
  const [commune, setCommune] = useState<string>("");
  const [shown, setShown] = useState(PAGE);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  const load = useCallback((fresh = false) => {
    setLoading(true);
    fetch(`/api/interim${fresh ? "?fresh=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Payload) => setData(d))
      .catch(() => setData({ offers: [], sources: [], ville: "", minutes: 0, error: "Impossible de charger les missions." }))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => load(), [load]);

  const offers = data?.offers ?? [];

  // Métiers et agences les plus fréquents, pour les raccourcis.
  const topMetiers = useMemo(() => {
    const c = new Map<string, number>();
    for (const o of offers) {
      const m = metier(o.title);
      if (m.length >= 3) c.set(m, (c.get(m) || 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [offers]);
  const agencies = useMemo(() => {
    const c = new Map<string, number>();
    for (const o of offers) c.set(o.agency, (c.get(o.agency) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [offers]);
  const communes = useMemo(() => {
    const c = new Map<string, number>();
    for (const o of offers) {
      const k = o.location.split(",")[0].trim();
      if (k) c.set(k, (c.get(k) || 0) + 1);
    }
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [offers]);

  const filtered = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    return offers.filter((o) => {
      if (agency && o.agency !== agency) return false;
      if (commune && o.location.split(",")[0].trim() !== commune) return false;
      if (words.length) {
        const hay = fold(`${o.title} ${o.company} ${o.agency}`);
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [offers, q, agency, commune]);

  useEffect(() => setShown(PAGE), [q, agency, commune]);

  const addToSelection = async (o: Offer) => {
    setAdding(o.url);
    const offer: DiscoveredOffer = {
      url: o.url,
      company: o.company || o.agency,
      title: o.title,
      location: o.location,
      postedAt: o.postedAt,
      ats: "portals",
      source: `interim-${o.source}`,
      note: `Intérim via ${o.agency}`,
    };
    try {
      const r = await fetch("/api/explore/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offers: [offer] }) });
      if (r.ok) setAdded((s) => new Set(s).add(o.url));
    } finally {
      setAdding(null);
    }
  };

  const missing = (data?.sources ?? []).filter((s) => s.status === "needs-key");
  const hasFilters = Boolean(q || agency || commune);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 max-sm:pb-24">
      {/* ── En-tête ── */}
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Tous métiers · indépendant de votre profil</p>
          <h1 className={`${displayFont.className} mt-1 flex items-center gap-2.5 text-3xl font-semibold text-foreground`}>
            <HardHat className="size-7 text-brand" /> Missions d&apos;intérim
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            {loading && !data ? (
              "Lecture des agences en cours…"
            ) : (
              <>
                <span className="font-mono font-semibold text-foreground">{offers.length}</span> missions autour de{" "}
                <span className="font-medium text-foreground">{data?.ville || "chez vous"}</span>
                {data?.minutes ? ` · ${data.minutes} min de trajet maximum` : ""}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-xs transition hover:bg-surface-hover disabled:opacity-60 max-sm:min-h-[44px]"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
          Actualiser
        </button>
      </header>

      {/* ── Sources ── */}
      <section className="panel mt-5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(data?.sources ?? []).map((s) => (
            <span
              key={s.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px]",
                s.status === "ok" ? "border-brand/25 bg-brand-soft text-foreground" : "border-dashed border-border text-muted",
              )}
            >
              {s.status === "ok" ? <CircleCheck className="size-3.5 text-brand" /> : s.status === "needs-key" ? <KeyRound className="size-3.5 text-faint" /> : <CircleDashed className="size-3.5 text-red-500" />}
              {s.label}
              {s.status === "ok" && <span className="font-mono text-[11.5px] font-semibold text-brand-text">{s.count}</span>}
              {s.status === "needs-key" && <span className="text-[11px] text-faint">clé gratuite</span>}
              {s.status === "error" && <span className="text-[11px] text-red-500">indisponible</span>}
            </span>
          ))}
          {loading && !data && <span className="text-[13px] text-muted">Chargement des sources…</span>}
        </div>
        {missing.some((s) => s.id === "france-travail") && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
            <KeyRound className="size-3.5 text-brand" />
            <span>
              Ajoutez la clé <strong className="text-foreground">France Travail</strong> pour voir les missions de <strong className="text-foreground">toutes les agences</strong> (Adecco, Manpower, Proman, Crit, Start People, Samsic…).
            </span>
            <Link href="/portals" className="font-semibold text-brand-text hover:underline">
              Ajouter les clés →
            </Link>
          </p>
        )}
      </section>

      {/* ── Recherche + filtres ── */}
      <section className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-full sm:basis-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Métier, entreprise ou agence (ex. cariste, électricien, Synergie)…"
              aria-label="Rechercher une mission"
              className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-[14px] text-foreground outline-none transition focus:border-brand/50"
            />
          </label>
          <select
            value={commune}
            onChange={(e) => setCommune(e.target.value)}
            aria-label="Filtrer par commune"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[13.5px] text-foreground max-sm:min-h-11 max-sm:flex-1"
          >
            <option value="">Toutes les communes</option>
            {communes.map(([c, n]) => (
              <option key={c} value={c}>
                {c} ({n})
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setAgency(null);
                setCommune("");
              }}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2.5 text-[13px] text-muted hover:text-foreground"
            >
              <X className="size-4" /> Effacer
            </button>
          )}
        </div>

        {topMetiers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {topMetiers.map(([m, n]) => (
              <button
                key={m}
                type="button"
                onClick={() => setQ(fold(q) === fold(m) ? "" : m)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] transition",
                  fold(q) === fold(m) ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted hover:border-brand/40 hover:text-foreground",
                )}
              >
                {m} <span className="font-mono opacity-70">{n}</span>
              </button>
            ))}
          </div>
        )}

        {agencies.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow mr-1">Agences</span>
            {agencies.map(([a, n]) => (
              <button
                key={a}
                type="button"
                onClick={() => setAgency(agency === a ? null : a)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] transition",
                  agency === a ? "border-brand bg-brand-soft text-foreground" : "border-border bg-surface text-muted hover:text-foreground",
                )}
              >
                <span className="size-2 rounded-full" style={{ background: `hsl(${hueOf(a)} 60% 48%)` }} />
                {a} <span className="font-mono opacity-70">{n}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Résultats ── */}
      <p className="mt-6 text-[13px] text-muted">
        {loading && !data ? "" : `${filtered.length} mission${filtered.length > 1 ? "s" : ""}${hasFilters ? " correspondantes" : ""}`}
      </p>

      {loading && !data ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-36 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel mt-3 p-10 text-center">
          <HardHat className="mx-auto size-8 text-faint" />
          <p className="mt-3 text-sm font-semibold text-foreground">Aucune mission ne correspond</p>
          <p className="mt-1 text-[13px] text-muted">Essayez un autre métier, une autre commune, ou ajoutez des sources.</p>
        </div>
      ) : (
        <>
          <div className="stagger mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.slice(0, shown).map((o) => {
              const isAdded = added.has(o.url);
              return (
                <article key={o.url} className="panel lift flex flex-col gap-2.5 p-4">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-0.5 inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white"
                      style={{ background: `hsl(${hueOf(o.agency)} 55% 42%)` }}
                    >
                      {o.agency}
                    </span>
                    {o.postedAt && <span className="ml-auto shrink-0 text-[11px] text-faint">{ago(o.postedAt)}</span>}
                  </div>
                  <h3 className="text-[14.5px] font-semibold leading-snug text-foreground">{o.title}</h3>
                  <p className="flex flex-col gap-0.5 text-[12.5px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0" /> {o.location.split(",")[0] || "Lieu non précisé"}
                    </span>
                    {o.company && o.company !== o.agency && (
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 className="size-3.5 shrink-0" /> {o.company}
                      </span>
                    )}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 border-t border-border/70 pt-3">
                    <a
                      href={o.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12.5px] font-semibold text-brand-foreground transition hover:bg-brand-200 max-sm:min-h-11"
                    >
                      Voir l&apos;annonce <ArrowUpRight className="nudge-x size-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => void addToSelection(o)}
                      disabled={isAdded || adding === o.url}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12.5px] font-medium text-muted transition hover:text-foreground disabled:opacity-70 max-sm:min-h-11"
                    >
                      {adding === o.url ? <Loader2 className="size-3.5 animate-spin" /> : isAdded ? <Check className="size-3.5 text-brand" /> : <Plus className="size-3.5" />}
                      {isAdded ? "Dans ma sélection" : "Ajouter à ma sélection"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {filtered.length > shown && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-hover"
              >
                Afficher plus ({filtered.length - shown} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
