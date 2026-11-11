"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MapPin, Pencil, Plus, Layers, Briefcase } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ExploreFilters } from "@/lib/explore";
import type { SearchProfile } from "@/lib/search-profile-types";

function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/**
 * « Affiner la recherche » de l'Explorer : on choisit un PROFIL plutôt que de
 * régler postes et communes à la main. Choisir un profil :
 *  - active son CV (cv.md) pour l'évaluation et les candidatures ;
 *  - applique ses filtres (postes + synonymes, exclusions, zone de trajet, sources).
 * Les réglages fins se font dans le profil lui-même (page Mon CV → Modifier).
 */
export function ProfileSwitcher({
  onApply,
  onActiveName,
}: {
  filters?: ExploreFilters;
  onApply: (f: ExploreFilters) => void;
  onActiveName?: (name: string | null) => void;
}) {
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/search-profiles", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list: SearchProfile[] = Array.isArray(d.profiles) ? d.profiles : [];
        setProfiles(list);
        setActive(d.active ?? null);
        onActiveName?.(list.find((p) => p.id === d.active)?.name ?? null);
      })
      .catch(() => setErr("Impossible de charger les profils."))
      .finally(() => setLoaded(true));
  }, [onActiveName]);

  const choose = async (p: SearchProfile) => {
    setBusy(p.id);
    setErr("");
    try {
      const r = await fetch(`/api/search-profiles/${encodeURIComponent(p.id)}/activate`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "activation impossible");
      setActive(p.id);
      onActiveName?.(p.name);
      onApply(d.filters as ExploreFilters);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  };

  if (!loaded) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted">
        <Loader2 className="size-4 animate-spin" /> Chargement des profils…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-sm font-semibold text-foreground">Choisissez le profil à rechercher</p>
        <span className="text-[12px] text-muted">postes, synonymes, zone de trajet et CV propres à chaque profil</span>
      </div>
      {err && <p className="text-[12px] text-red-500">{err}</p>}

      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((p) => {
          const isActive = p.id === active;
          const hue = hueOf(p.id);
          return (
            // Un bouton ne peut pas en contenir un autre : la carte (sélection) et le
            // lien « Modifier » sont frères dans un conteneur commun.
            <div key={p.id} className="lift relative">
            <button
              type="button"
              onClick={() => void choose(p)}
              disabled={busy !== null}
              aria-pressed={isActive}
              title={isActive ? "Profil utilisé pour la recherche" : "Utiliser ce profil pour la recherche"}
              className={cn(
                "relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-xl border bg-background/60 p-3 pb-11 pt-4 text-left transition disabled:cursor-wait",
                isActive ? "border-brand shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_15%,transparent)]" : "border-border hover:border-foreground/30",
              )}
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: `hsl(${hue} 65% 55%)` }} />
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">{p.name}</span>
                {busy === p.id ? (
                  <Loader2 className="ml-auto size-4 shrink-0 animate-spin text-brand" />
                ) : isActive ? (
                  <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-brand-foreground">
                    <Check className="size-3" /> Sélectionné
                  </span>
                ) : null}
              </span>
              <span className="flex items-start gap-1.5 text-[12px] text-muted">
                <Briefcase className="mt-0.5 size-3.5 shrink-0" />
                <span className="line-clamp-2">{p.titles.join(", ") || "aucun poste"}</span>
              </span>
              <span className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-faint">
                <span className="inline-flex items-center gap-1">
                  <Layers className="size-3" /> {p.synonyms.length} synonymes
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" /> {p.remoteOnly ? "Télétravail" : `${p.originCity}${p.originPostalCode ? ` (${p.originPostalCode})` : ""} · ${p.commuteMinutes} min`}
                </span>
              </span>
            </button>
            <Link
              href={`/cv?modifier=${encodeURIComponent(p.id)}`}
              className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-medium text-muted transition hover:border-brand/50 hover:text-foreground"
              aria-label={`Modifier le profil ${p.name}`}
            >
              <Pencil className="size-3" /> Modifier
            </Link>
            </div>
          );
        })}

        <Link
          href="/cv"
          className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border p-3 text-center text-[12px] text-muted transition hover:border-brand/60 hover:text-foreground"
        >
          {profiles.length ? <Pencil className="size-4" /> : <Plus className="size-4" />}
          {profiles.length ? "Créer ou modifier un profil" : "Créer un profil à partir d'un CV"}
        </Link>
      </div>
    </div>
  );
}
