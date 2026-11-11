"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  FileText,
  Layers,
  Loader2,
  MapPin,
  Pencil,
  Plug,
  Search,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { displayFont } from "@/lib/fonts";
import type { CvSummary, SearchProfile } from "@/lib/search-profile-types";

export type SourceStatus = {
  id: string;
  name: string;
  status: "live" | "configured" | "unconfigured" | "broken";
  free: boolean;
};

function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function initials(name: string): string {
  const w = name.replace(/[^\p{L}\s-]/gu, " ").split(/[\s-]+/).filter(Boolean);
  return ((w[0]?.[0] || "P") + (w[1]?.[0] || "")).toUpperCase();
}

/** Noms courts des sources pour la liste compacte. */
const SHORT: Record<string, string> = {
  "france-travail": "France Travail",
  "la-bonne-boite": "La Bonne Boîte",
  jooble: "Jooble",
  adzuna: "Adzuna",
  careerjet: "Careerjet",
  wttj: "Welcome to the Jungle",
  "service-public": "Service Public",
  "ats-networks": "Employeurs & intérim (direct)",
};

/**
 * Le cœur de « Aujourd'hui » : le profil de recherche pris en compte (postes,
 * synonymes, zone de trajet, CV) et l'état des sources qui l'alimentent.
 */
export function ProfileOverview({
  profiles,
  activeId,
  summaries,
  sources,
}: {
  profiles: SearchProfile[];
  activeId: string | null;
  summaries: Record<string, CvSummary>;
  sources: SourceStatus[];
}) {
  const router = useRouter();
  const active = profiles.find((p) => p.id === activeId) || null;
  const [zone, setZone] = useState<{ count: number; km: number } | null>(null);
  const [switching, setSwitching] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (!active || active.remoteOnly) return;
    const qs = new URLSearchParams({ minutes: String(active.commuteMinutes), ville: active.originCity });
    fetch(`/api/explore/zone?${qs}`)
      .then((r) => r.json())
      .then((d) => d.ok && setZone({ count: d.communesCount, km: d.rayonMaxKm }))
      .catch(() => {});
  }, [active]);

  const switchTo = async (id: string) => {
    setMenu(false);
    setSwitching(true);
    try {
      await fetch(`/api/search-profiles/${encodeURIComponent(id)}/activate`, { method: "POST" });
      router.refresh();
    } finally {
      setSwitching(false);
    }
  };

  const on = sources.filter((s) => s.status === "live" || s.status === "configured");
  const off = sources.filter((s) => s.status === "unconfigured" || s.status === "broken");

  if (!active) {
    return (
      <section className="panel flex flex-wrap items-center gap-4 p-6">
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
          <UserRound className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Aucun profil de recherche</p>
          <p className="text-sm text-muted">Importez un CV : les postes, leurs synonymes et votre zone seront créés automatiquement.</p>
        </div>
        <Link href="/cv" className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand-200">
          Créer mon profil <ArrowRight className="size-4" />
        </Link>
      </section>
    );
  }

  const hue = hueOf(active.id);
  const s = summaries[active.id];
  const others = profiles.filter((p) => p.id !== active.id);

  return (
    <section className="stagger grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ── Profil pris en compte ── */}
      <article className="panel relative overflow-hidden">
        <div className="h-1 w-full" style={{ background: `hsl(${hue} 60% 48%)` }} />
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-start gap-4">
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
              style={{ background: `hsl(${hue} 55% 42%)` }}
              aria-hidden
            >
              {initials(active.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Profil pris en compte</p>
              <h2 className={`${displayFont.className} mt-0.5 break-words text-2xl font-semibold text-foreground sm:truncate`}>{active.name}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-muted">
                <FileText className="size-3.5 shrink-0" />
                {s?.hasCv ? [s.person, s.headline].filter(Boolean).join(" · ") || "CV importé" : "Aucun CV associé"}
              </p>
            </div>
            <div className="relative flex items-center gap-2 max-sm:w-full">
              {others.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenu((v) => !v)}
                    disabled={switching}
                    aria-expanded={menu}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-medium text-foreground transition hover:bg-surface-hover max-sm:min-h-11"
                  >
                    {switching ? <Loader2 className="size-4 animate-spin" /> : <UserRound className="size-4 text-muted" />}
                    Changer
                    <ChevronDown className={cn("size-3.5 text-muted transition", menu && "rotate-180")} />
                  </button>
                  {menu && (
                    <ul className="panel animate-rise absolute right-0 z-20 mt-1.5 w-64 p-1 shadow-lg">
                      {others.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => void switchTo(p.id)}
                            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-surface-hover"
                          >
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: `hsl(${hueOf(p.id)} 60% 48%)` }} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-foreground">{p.name}</span>
                              <span className="block truncate text-[11px] text-faint">{p.titles.slice(0, 3).join(", ")}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <Link
                href="/cv"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] font-medium text-muted transition hover:bg-surface-hover hover:text-foreground max-sm:min-h-11"
              >
                <Pencil className="size-3.5" /> Modifier
              </Link>
            </div>
          </div>

          <div className="mt-5">
            <p className="eyebrow mb-2 flex items-center gap-1.5">
              <Briefcase className="size-3.5" /> Postes recherchés
            </p>
            <div className="stagger flex flex-wrap gap-1.5">
              {active.titles.length ? (
                active.titles.map((t) => (
                  <span key={t} className="rounded-md border border-brand/25 bg-brand-soft px-2 py-1 text-[12.5px] font-medium text-brand-text">
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-sm text-amber-600 dark:text-amber-400">Aucun poste — modifiez le profil.</span>
              )}
            </div>
            {active.synonyms.length > 0 && (
              <p className="mt-2 line-clamp-2 text-[12px] text-faint">
                <span className="font-medium text-muted">+ {active.synonyms.length} variantes :</span> {active.synonyms.slice(0, 14).join(", ")}
                {active.synonyms.length > 14 ? "…" : ""}
              </p>
            )}
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
            <Fact icon={MapPin} label="Départ" value={active.remoteOnly ? "Télétravail" : active.originCity} />
            <Fact icon={CircleDashed} label="Trajet max." value={active.remoteOnly ? "—" : `${active.commuteMinutes} min`} />
            <Fact
              icon={Layers}
              label="Communes couvertes"
              value={active.remoteOnly ? "France" : zone ? `${zone.count}` : "…"}
              hint={zone && !active.remoteOnly ? `rayon ≈ ${Math.round(zone.km)} km` : undefined}
            />
            <Fact icon={Search} label="Exclusions" value={active.negative.length ? `${active.negative.length} mots` : "aucune"} hint={active.negative.slice(0, 3).join(", ")} />
          </dl>
        </div>
      </article>

      {/* ── Sources qui alimentent la recherche ── */}
      <aside className="panel flex flex-col p-5">
        <div className="flex items-center justify-between">
          <p className="eyebrow flex items-center gap-1.5">
            <Plug className="size-3.5" /> Sources d'offres
          </p>
          <span className="font-mono text-[11px] text-faint">
            {on.length}/{sources.length} actives
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-hover">
          <div className="grow-x h-full rounded-full bg-brand" style={{ width: `${sources.length ? (on.length / sources.length) * 100 : 0}%` }} />
        </div>
        <ul className="stagger mt-4 space-y-2 text-[13px]">
          {[...on, ...off].map((src) => {
            const ok = src.status === "live" || src.status === "configured";
            return (
              <li key={src.id} className="flex items-center gap-2">
                {ok ? (
                  <span className="relative inline-flex">
                    <CircleCheck className="size-4 shrink-0 text-brand" />
                    <span className="live-dot absolute inset-[3px]" aria-hidden />
                  </span>
                ) : (
                  <CircleDashed className="size-4 shrink-0 text-faint" />
                )}
                <span className={cn("min-w-0 flex-1 truncate", ok ? "text-foreground" : "text-muted")}>{SHORT[src.id] || src.name}</span>
                {!ok && <span className="text-[11px] text-faint">gratuit</span>}
              </li>
            );
          })}
        </ul>
        {off.length > 0 && (
          <Link
            href="/portals"
            className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2 pt-2 text-[13px] font-semibold text-brand-text transition hover:bg-brand/15 max-sm:min-h-11"
            style={{ marginTop: "1rem" }}
          >
            Activer {off.length} source{off.length > 1 ? "s" : ""} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </aside>
    </section>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-faint">
        <Icon className="size-3.5" /> {label}
      </dt>
      <dd className="mt-0.5 truncate text-[15px] font-semibold text-foreground">{value}</dd>
      {hint && <dd className="truncate text-[11px] text-faint">{hint}</dd>}
    </div>
  );
}
