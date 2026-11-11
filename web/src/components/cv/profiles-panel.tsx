"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Check,
  Clock,
  FileText,
  Layers,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { displayFont } from "@/lib/fonts";
import { expandTitles } from "@/lib/job-synonyms.mjs";
import type { CvSummary, SearchProfile } from "@/lib/search-profile-types";
import { SOURCE_HINT } from "@/lib/explore";
import { CvEditor } from "@/components/cv-editor";
import { CvIngest } from "./cv-ingest";
import { LinksBox } from "./links-box";

const splitList = (v: string) => v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

/** Teinte stable par profil, pour distinguer les cartes d'un coup d'œil. */
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function initials(name: string): string {
  const w = name.replace(/[^\p{L}\s-]/gu, " ").split(/[\s-]+/).filter(Boolean);
  return ((w[0]?.[0] || "P") + (w[1]?.[0] || "")).toUpperCase();
}

function ago(iso: string): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(d) || d <= 0) return "aujourd'hui";
  if (d === 1) return "hier";
  if (d < 30) return `il y a ${d} j`;
  return `il y a ${Math.floor(d / 30)} mois`;
}

/**
 * Profils de recherche en cartes : un profil par CV importé, chacun avec ses
 * postes, synonymes, exclusions et zone de trajet. Le profil actif fournit
 * cv.md et les filtres de départ de l'Explorer.
 */
export function ProfilesPanel({ onActiveChange }: { onActiveChange?: (activeName: string | null) => void }) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [summaries, setSummaries] = useState<Record<string, CvSummary>>({});
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  // Incrémenté quand les liens réécrivent les CV : recharge l'éditeur ouvert.
  const [cvVersion, setCvVersion] = useState(0);

  const apply = useCallback(
    (d: { profiles?: SearchProfile[]; active?: string | null; summaries?: Record<string, CvSummary> }) => {
      if (Array.isArray(d.profiles)) setProfiles(d.profiles);
      if (d.summaries) setSummaries(d.summaries);
      if (d.active !== undefined) {
        setActive(d.active);
        const name = d.profiles?.find((p) => p.id === d.active)?.name ?? null;
        onActiveChange?.(name);
      }
    },
    [onActiveChange],
  );

  const load = useCallback(() => {
    fetch("/api/search-profiles", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        apply(d);
        if (!d.profiles?.length) setImporting(true);
      })
      .catch(() => setErr("Impossible de charger les profils."))
      .finally(() => setLoading(false));
  }, [apply]);
  useEffect(load, [load]);

  // Ouvrir « Modifier » amène la carte agrandie en haut de l'écran, une seule fois.
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => document.getElementById(`profil-${editing}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return () => clearTimeout(t);
  }, [editing]);

  const call = async (id: string, url: string, init: RequestInit) => {
    setBusy(id);
    setErr("");
    try {
      const r = await fetch(url, init);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erreur");
      apply(d);
      return d;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const activate = (id: string) => call(id, `/api/search-profiles/${encodeURIComponent(id)}/activate`, { method: "POST" });
  const search = async (id: string) => {
    if (id === active || (await activate(id))) router.push("/explore?run=1");
  };
  const remove = async (p: SearchProfile) => {
    if (!window.confirm(`Supprimer le profil « ${p.name} » et son CV ? Cette action est définitive.`)) return;
    await call(p.id, `/api/search-profiles/${encodeURIComponent(p.id)}`, { method: "DELETE" });
  };

  return (
    <section className="mb-8">
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <h1 className={`${displayFont.className} text-3xl text-foreground`}>Mes CV & profils</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Un profil par CV : ses postes, ses synonymes et sa zone de recherche. Choisissez-en un avant chaque recherche.
          </p>
        </div>
        <span className="ml-auto rounded-full border border-border bg-surface/60 px-3 py-1 text-[12px] text-muted">
          {profiles.length} profil{profiles.length > 1 ? "s" : ""}
        </span>
      </header>

      {/* Liens personnels : ajoutés automatiquement dans tous les CV. */}
      <LinksBox
        onSaved={() => {
          load();
          setCvVersion((v) => v + 1);
        }}
      />

      {err && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-600 dark:text-red-400">{err}</p>}

      {importing && (
        <div className="animate-rise mb-5 rounded-2xl border border-brand/40 bg-surface/50 p-4 md:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-brand" />
            <p className="text-sm font-semibold text-foreground">Nouveau profil à partir d&apos;un CV</p>
            <span className="text-[12px] text-faint">PDF, Word ou texte · lu en local par votre outil IA, détecté automatiquement</span>
            {profiles.length > 0 && (
              <button type="button" onClick={() => setImporting(false)} className="ml-auto rounded-lg p-1.5 text-muted hover:text-foreground" aria-label="Fermer">
                <X className="size-4" />
              </button>
            )}
          </div>
          <CvIngest
            onSaved={() => {
              setImporting(false);
              load();
            }}
          />
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl border border-border bg-surface/40" />
          ))}
        </div>
      ) : (
        <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {profiles.map((p) =>
            editing === p.id ? (
              <div
                key={p.id}
                id={`profil-${p.id}`}
                className="animate-rise col-span-full scroll-mt-4 overflow-hidden rounded-2xl border border-brand bg-surface/60 shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_15%,transparent)]"
              >
                <div className="h-1.5 w-full" style={{ background: `hsl(${hueOf(p.id)} 65% 55%)` }} />
                <div className="space-y-6 p-4 md:p-6">
                <ProfileEditor
                  profile={p}
                  onCancel={() => setEditing(null)}
                  onSave={async (patch) => {
                    const d = await call(p.id, `/api/search-profiles/${encodeURIComponent(p.id)}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(patch),
                    });
                    void d;
                  }}
                />
                {/* Le CV de CE profil, en Markdown + aperçu, directement dans la carte. */}
                <div className="border-t border-border pt-5">
                  <CvEditor key={`${p.id}-${cvVersion}`} profileId={p.id} embedded />
                </div>
                </div>
              </div>
            ) : (
              <ProfileCard
                key={p.id}
                dimmed={editing !== null}
                profile={p}
                summary={summaries[p.id]}
                isActive={p.id === active}
                busy={busy === p.id}
                onActivate={() => void activate(p.id)}
                onSearch={() => void search(p.id)}
                onEdit={() => setEditing(p.id)}
                onDelete={() => void remove(p)}
              />
            ),
          )}

          {!importing && editing === null && (
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="group flex min-h-56 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-6 text-center transition hover:border-brand/60 hover:bg-brand/5"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-brand/10 text-brand transition group-hover:scale-105">
                <Plus className="size-5" />
              </span>
              <span className="text-sm font-semibold text-foreground">Nouveau profil</span>
              <span className="max-w-[16rem] text-[12px] text-muted">Importez un autre CV pour chercher un autre type de poste</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ProfileCard({
  profile: p,
  summary,
  isActive,
  busy,
  onActivate,
  onSearch,
  onEdit,
  onDelete,
  dimmed = false,
}: {
  profile: SearchProfile;
  dimmed?: boolean;
  summary?: CvSummary;
  isActive: boolean;
  busy: boolean;
  onActivate: () => void;
  onSearch: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const hue = hueOf(p.id);
  const shown = p.titles.slice(0, 4);
  const more = p.titles.length - shown.length;
  return (
    <article
      className={cn(
        "lift relative flex flex-col overflow-hidden rounded-2xl border bg-surface/50",
        dimmed && "opacity-60 hover:opacity-100",
        isActive ? "border-brand shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand)_15%,transparent)]" : "border-border hover:border-foreground/25",
      )}
    >
      <div className="h-1.5 w-full" style={{ background: `hsl(${hue} 65% 55%)` }} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
            style={{ background: `hsl(${hue} 60% 48%)` }}
            aria-hidden
          >
            {initials(p.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className={`${displayFont.className} truncate text-xl leading-tight text-foreground`} title={p.name}>
              {p.name}
            </h3>
            <p className="truncate text-[12px] text-muted">
              {summary?.hasCv
                ? [summary.person, summary.headline].filter(Boolean).join(" · ") || "CV importé"
                : "Aucun CV associé"}
            </p>
          </div>
          {isActive ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-brand-foreground">
              <Check className="size-3" /> Actif
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {shown.length ? (
            shown.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px] text-foreground">
                <Briefcase className="size-3 text-muted" />
                {t}
              </span>
            ))
          ) : (
            <span className="text-[12px] text-amber-600 dark:text-amber-400">Aucun poste — cliquez sur Modifier</span>
          )}
          {more > 0 && <span className="rounded-full px-2 py-0.5 text-[11px] text-muted">+{more}</span>}
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] text-muted">
          <div className="flex items-center gap-1.5">
            <Layers className="size-3.5 shrink-0" />
            <dt className="sr-only">Synonymes</dt>
            <dd>{p.synonyms.length} synonymes</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            <dt className="sr-only">Zone</dt>
            <dd className="truncate">{p.remoteOnly ? "Télétravail" : `${p.originCity} · ${p.commuteMinutes} min`}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <FileText className="size-3.5 shrink-0" />
            <dt className="sr-only">CV</dt>
            <dd>{summary?.hasCv ? `${summary.experiences} expérience${summary.experiences > 1 ? "s" : ""}` : "—"}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" />
            <dt className="sr-only">Mis à jour</dt>
            <dd>{ago(p.updatedAt)}</dd>
          </div>
        </dl>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          <button
            type="button"
            onClick={onSearch}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-[12px] font-semibold text-brand-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60 max-sm:min-h-11"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            Chercher
          </button>
          {!isActive && (
            <button type="button" onClick={onActivate} disabled={busy} className={btn} title="Utiliser ce CV et ces filtres">
              <Check className="size-3.5" /> Activer
            </button>
          )}
          <button type="button" onClick={onEdit} className={btn}>
            <Pencil className="size-3.5" /> Modifier
          </button>
          <button type="button" onClick={onDelete} disabled={busy} className={cn(btn, "ml-auto hover:border-red-400 hover:text-red-500")} aria-label={`Supprimer ${p.name}`}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

const btn =
  "inline-flex items-center gap-1 rounded-xl border border-border px-2.5 py-2 text-[12px] font-medium text-muted transition hover:text-foreground disabled:opacity-50 max-sm:min-h-11";

const input =
  "mt-1 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand/40";

function ProfileEditor({
  profile,
  onSave,
  onCancel,
}: {
  profile: SearchProfile;
  onSave: (patch: Partial<SearchProfile>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [titles, setTitles] = useState(profile.titles.join(", "));
  const [synonyms, setSynonyms] = useState(profile.synonyms.join(", "));
  const [negative, setNegative] = useState(profile.negative.join(", "));
  const [city, setCity] = useState(profile.originCity);
  const [minutes, setMinutes] = useState(profile.commuteMinutes);
  const [remoteOnly, setRemoteOnly] = useState(profile.remoteOnly);
  const [withWorkday, setWithWorkday] = useState(profile.sources.includes("workday"));
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Pencil className="size-4 text-brand" />
        <p className="text-sm font-semibold text-foreground">Modifier « {profile.name} »</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-[12px] text-muted">
          Nom du profil
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <label className="block text-[12px] text-muted">
          Postes recherchés
          <input value={titles} onChange={(e) => setTitles(e.target.value)} className={input} />
        </label>
      </div>
      <label className="block text-[12px] text-muted">
        <span className="flex flex-wrap items-center gap-2">
          Synonymes et variantes (séparés par des virgules)
          <button
            type="button"
            onClick={() => setSynonyms((expandTitles(splitList(titles)) as string[]).join(", "))}
            className="inline-flex items-center gap-1 text-brand hover:underline"
          >
            <RefreshCw className="size-3" /> régénérer depuis les postes
          </button>
        </span>
        <textarea value={synonyms} onChange={(e) => setSynonyms(e.target.value)} rows={3} className={input} />
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block text-[12px] text-muted">
          Mots exclus
          <input value={negative} onChange={(e) => setNegative(e.target.value)} className={input} />
        </label>
        <label className="block text-[12px] text-muted">
          Ville de départ
          <input value={city} onChange={(e) => setCity(e.target.value)} className={input} />
        </label>
        <label className="block text-[12px] text-muted">
          Trajet maximum : {minutes} min
          <input type="range" min={10} max={90} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="mt-3 w-full accent-[var(--brand)]" />
        </label>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="inline-flex items-center gap-2 text-[12px] text-muted">
          <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
          Télétravail uniquement
        </label>
        <label className="inline-flex items-start gap-2 text-[12px] text-muted" title={SOURCE_HINT.workday}>
          <input type="checkbox" className="mt-0.5" checked={withWorkday} onChange={(e) => setWithWorkday(e.target.checked)} />
          <span>
            Inclure les grands groupes (Workday)
            <span className="block text-[11px] text-faint">Plus lent, peu d&apos;offres locales. Les sources régionales sont toujours incluses.</span>
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave({
              name,
              titles: splitList(titles),
              synonyms: splitList(synonyms),
              negative: splitList(negative),
              originCity: city,
              commuteMinutes: minutes,
              remoteOnly,
              sources: withWorkday ? ["portals", "workday"] : ["portals"],
            });
            setSaving(false);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-brand-foreground transition hover:brightness-110 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Enregistrer le profil
        </button>
        <button type="button" onClick={onCancel} className={btn}>
          Fermer
        </button>
      </div>
    </div>
  );
}
