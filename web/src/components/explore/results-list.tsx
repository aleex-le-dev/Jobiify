"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Coins, ArrowDownWideNarrow, Target, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { offerSourceLabel, type DiscoveredOffer } from "@/lib/explore";
import { useI18n } from "@/components/i18n-provider";
import { parseOfferTimestamp, isOfferWithinSinceDays } from "@/lib/format";
import { foldText } from "@/lib/offer-match.mjs";
import { DiscoveryCard } from "./discovery-card";
import { SourcesPanel } from "./sources-panel";
import { useExplore } from "./explore-provider";

export type EnrichedOffer = DiscoveredOffer & { inPipeline: boolean; evaluatedN?: string };

type SortKey = "recent" | "fit";
const PAGE_SIZE = 60;
const FIT_RANK: Record<string, number> = { strong: 3, related: 2, weak: 1 };
const byDate = (a: DiscoveredOffer, b: DiscoveredOffer) =>
  (parseOfferTimestamp(b.postedAt) || 0) - (parseOfferTimestamp(a.postedAt) || 0) || a.title.localeCompare(b.title);

export function ResultsList({ offers }: { offers: EnrichedOffer[] }) {
  const { isFr } = useI18n();
  const { error, addToPipeline, added, removed, mode, running, filters, sourceReports } = useExplore();
  const isAi = mode === "ai";
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [closeOnly, setCloseOnly] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);

  // Offres dans la fenêtre de date choisie (24 h, 3 j, 7 j…). « Toutes » = sans limite.
  // Pas en recherche IA : ses offres n'ont jamais de date fiable (seulement une
  // indication texte), donc le filtre de date les écartait toutes → « 0 offre ».
  const inWindow = useMemo(() => {
    if (isAi || !filters?.sinceDays || filters.sinceDays <= 0) return offers;
    return offers.filter((o) => isOfferWithinSinceDays(o.postedAt, filters.sinceDays));
  }, [offers, filters?.sinceDays, isAi]);

  // Répartition par source, pour les pastilles de filtre (la plus fournie d'abord).
  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of inWindow) {
      const label = offerSourceLabel(o, isFr);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [inWindow, isFr]);

  // Une source filtrée qui n'existe plus après une nouvelle recherche est oubliée.
  useEffect(() => {
    if (sourceFilter && !sourceCounts.some(([label]) => label === sourceFilter)) setSourceFilter(null);
  }, [sourceCounts, sourceFilter]);

  const closeCount = useMemo(() => inWindow.filter((o) => o.fit?.band === "strong" || o.fit?.band === "related").length, [inWindow]);

  const view = useMemo(() => {
    const needle = foldText(q);
    let list = inWindow;
    if (sourceFilter) list = list.filter((o) => offerSourceLabel(o, isFr) === sourceFilter);
    if (closeOnly) list = list.filter((o) => o.fit?.band === "strong" || o.fit?.band === "related");
    if (needle) {
      list = list.filter((o) => foldText(`${o.title} ${o.company} ${o.location}`).includes(needle));
    }
    return [...list].sort(
      sort === "fit" ? (a, b) => (FIT_RANK[b.fit?.band ?? ""] || 0) - (FIT_RANK[a.fit?.band ?? ""] || 0) || byDate(a, b) : byDate,
    );
  }, [inWindow, q, sort, sourceFilter, closeOnly, isFr]);

  // Retour au début de la liste dès que les critères changent.
  useEffect(() => setShown(PAGE_SIZE), [q, sort, sourceFilter, closeOnly, filters?.sinceDays]);

  const addable = view.filter((o) => {
    const inSel = (added.has(o.url) || o.inPipeline) && !removed?.has(o.url);
    return !inSel && !o.evaluatedN;
  });
  const narrowed = Boolean(q.trim() || sourceFilter || closeOnly);
  const hiddenByDate = offers.length - inWindow.length;
  const page = view.slice(0, shown);

  return (
    <div className="space-y-4">
      {!isAi && <SourcesPanel reports={sourceReports} />}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm text-foreground" aria-live="polite">
            <span className="text-lg font-semibold tabular-nums">{view.length}</span>{" "}
            {isFr
              ? `offre${view.length > 1 ? "s" : ""}${narrowed ? ` sur ${inWindow.length}` : ` trouvée${view.length > 1 ? "s" : ""}`}`
              : `role${view.length === 1 ? "" : "s"}${narrowed ? ` of ${inWindow.length}` : " found"}`}
            {isAi && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <Coins className="size-3" /> {isFr ? "Consomme des jetons IA" : "Uses AI tokens"}
              </span>
            )}
          </p>
          {!isAi && hiddenByDate > 0 && (
            <p className="text-[12px] text-muted">
              {isFr
                ? `${hiddenByDate} autre${hiddenByDate > 1 ? "s" : ""} plus ancienne${hiddenByDate > 1 ? "s" : ""} — élargissez « Publié depuis » pour les voir.`
                : `${hiddenByDate} older — widen “Posted within” to see them.`}
            </p>
          )}
          {!isAi && error && <p className="text-[12px] text-amber-700 dark:text-amber-300">{error}</p>}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/40 px-2.5 py-1.5 focus-within:border-brand/50">
            <Search className="size-3.5 shrink-0 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isFr ? "Poste, entreprise, ville…" : "Role, company, city…"}
              aria-label={isFr ? "Filtrer les résultats" : "Filter results"}
              className="w-40 bg-transparent text-[13px] outline-none placeholder:text-faint"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label={isFr ? "Effacer" : "Clear"} className="text-faint hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </label>

          {!isAi && (
            <label className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/40 px-2.5 py-1.5 text-[13px] text-foreground">
              <ArrowDownWideNarrow className="size-3.5 shrink-0 text-faint" />
              <span className="sr-only">{isFr ? "Trier par" : "Sort by"}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="bg-transparent text-[13px] outline-none">
                <option value="recent">{isFr ? "Plus récentes" : "Most recent"}</option>
                <option value="fit">{isFr ? "Plus proches du profil" : "Closest to profile"}</option>
              </select>
            </label>
          )}

          {addable.length > 1 && (
            <button
              type="button"
              onClick={() => addToPipeline(addable)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/40 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-brand-soft hover:text-brand"
            >
              <Plus className="size-3.5" /> {isFr ? `Tout ajouter (${addable.length})` : `Add all ${addable.length}`}
            </button>
          )}
        </div>
      </div>

      {!isAi && (sourceCounts.length > 1 || closeCount > 0) && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={isFr ? "Filtrer par source" : "Filter by source"}>
          {closeCount > 0 && closeCount < inWindow.length && (
            <Chip active={closeOnly} onClick={() => setCloseOnly((v) => !v)}>
              <Target className="size-3" /> {isFr ? "Proches du profil" : "Close to profile"} <Count n={closeCount} />
            </Chip>
          )}
          {sourceCounts.length > 1 && (
            <>
              <Chip active={!sourceFilter} onClick={() => setSourceFilter(null)}>
                {isFr ? "Toutes les sources" : "All sources"}
              </Chip>
              {sourceCounts.map(([label, n]) => (
                <Chip key={label} active={sourceFilter === label} onClick={() => setSourceFilter(sourceFilter === label ? null : label)}>
                  {label} <Count n={n} />
                </Chip>
              ))}
            </>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {page.map((o) => (
          <DiscoveryCard key={o.url} offer={o} inPipeline={o.inPipeline} evaluatedN={o.evaluatedN} />
        ))}
      </div>

      {view.length > page.length && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/40 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand max-sm:min-h-11"
          >
            {isFr
              ? `Afficher ${Math.min(PAGE_SIZE, view.length - page.length)} offres de plus (${view.length - page.length} restantes)`
              : `Show ${Math.min(PAGE_SIZE, view.length - page.length)} more (${view.length - page.length} left)`}
          </button>
        </div>
      )}

      {view.length === 0 && (narrowed || !running) && (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm text-muted">
            {narrowed
              ? isFr
                ? "Aucune offre ne correspond à ces filtres."
                : "No role matches these filters."
              : isFr
                ? "Aucune offre dans cette période. Élargissez « Publié depuis » pour voir les plus anciennes."
                : "Nothing in this period. Widen “Posted within” to see older ones."}
          </p>
          {narrowed && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setSourceFilter(null);
                setCloseOnly(false);
              }}
              className="mt-3 text-sm font-medium text-brand hover:underline"
            >
              {isFr ? "Réinitialiser les filtres" : "Reset filters"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors max-sm:min-h-9",
        active ? "border-brand/40 bg-brand-soft text-brand" : "border-border bg-surface/40 text-muted hover:border-brand/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Count({ n }: { n: number }) {
  return <span className="tabular-nums opacity-70">{n}</span>;
}
