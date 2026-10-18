"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, ChevronDown, RotateCcw, AlertTriangle, Sparkles, Settings, Trash2, Clock, Coins } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { instrumentSerif } from "@/lib/fonts";
import type { Application, InboxJob } from "@/lib/career-ops";
import { normalizeTextKey } from "@/lib/core/normalize-text-key.mjs";
import { paramsToFilters, paramsToAi, RECENCY_FR, RECENCY_EN, type ExploreFilters } from "@/lib/explore";
import { isOfferWithinSinceDays } from "@/lib/format";
import { FilterBuilder } from "./filter-builder";
import { DiscoveringState } from "./discovering-state";
import { AiHuntView } from "./ai-hunt-view";
import { ExploreModeToggle } from "./explore-mode-toggle";
import { AiSearchBox } from "./ai-search-box";
import { ResultsList, type EnrichedOffer } from "./results-list";
import { useExplore } from "./explore-provider";
import { useI18n } from "@/components/i18n-provider";

// Same shape as core normalizeTextKey(s, " ") — never [^a-z0-9] (#2666).
const norm = (s: string) => normalizeTextKey(s, " ");
const CLI_NAMES: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  copilot: "Copilot CLI",
  qwen: "Qwen CLI",
  antigravity: "Antigravity CLI",
};

export function ExplorerView({
  seed,
  inboxSnapshot,
  appsSnapshot,
  rootExists,
}: {
  seed: { filters: ExploreFilters; seededFrom: string[] };
  inboxSnapshot: InboxJob[];
  appsSnapshot: Application[];
  rootExists: boolean;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const recencyList = isFr ? RECENCY_FR : RECENCY_EN;
  const { filters, setFilters, initFilters, phase, running, offers, discover, loadFresh, status, error, scannerMissing, mode, setMode, aiIntent, setAiIntent, discoverAI, companiesScanned, companiesAvailable, capHit, droppedNoDate, partial } = useExplore();

  // Référence stable sur la phase pour être lue dans un setTimeout sans stale closure.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const inited = useRef(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [cli, setCli] = useState<{ id: string | null; name?: string }>({ id: null });
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    try {
      const id = JSON.parse(localStorage.getItem("career-ops:config") || "{}").cliId || null;
      setCli({ id, name: id ? CLI_NAMES[id] || id : undefined });
    } catch {
      setCli({ id: null });
    }
  }, []);

  // Initialize once from the URL (shareable search) or the server seed — without
  // clobbering anything the assistant set before this mount.
  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    const sp = new URLSearchParams(window.location.search);
    const ai = paramsToAi(sp);
    if (ai !== null) {
      setMode("ai");
      setAiIntent(ai);
    } else if (sp.get("view") === "fresh") {
      // Today's "See all N" (#84) hands off here instead of a bare config form —
      // load the SAME /api/whats-new offers it already showed, through the normal
      // results-phase UI. The config form (Refine search / Re-cast) stays reachable.
      // Force scan mode: a session restored in "ai" mode (sessionStorage rehydrate)
      // must not show the AI-search UI for this scan-only hand-off.
      setMode("scan");
      initFilters(seed.filters);
      void loadFresh();
    } else {
      const hasSpecificFilterParams = sp.has("q") || sp.has("loc") || sp.has("ats") || sp.has("not") || sp.has("since");
      initFilters(hasSpecificFilterParams ? paramsToFilters(sp) : seed.filters);
      // Onboarding hand-off: ?run=1 auto-fires the free scan + flags the first-run
      // banner (the "matches found from your CV, free" reveal).
      if (sp.get("run") === "1") {
        setFirstRun(true);
        void discover();
      } else if (!hasSpecificFilterParams && phase === "idle") {
        // Auto-lancement : si on arrive sur Explorer sans session restaurée
        // ni params URL spéciaux, on démarre le scan après un tick pour laisser
        // la rehydration de session s'exécuter d'abord (sinon on relancerait
        // un scan même quand des résultats sont déjà disponibles).
        setTimeout(() => {
          // Vérification post-tick : on ne lance que si la phase est toujours idle
          // (pas de session restaurée entre-temps).
          if (phaseRef.current === "idle") void discover();
        }, 0);
      }
    }
  }, [seed.filters, initFilters, setMode, setAiIntent, discover, loadFresh, phase]);

  const inboxUrls = useMemo(() => new Set(inboxSnapshot.map((j) => j.url)), [inboxSnapshot]);
  const enriched: EnrichedOffer[] = useMemo(
    () =>
      offers.map((o) => {
        const inPipeline = inboxUrls.has(o.url);
        const c = norm(o.company);
        const t = norm(o.title);
        const ev = appsSnapshot.find((a) => {
          if (norm(a.company) !== c) return false;
          const ar = norm(a.role);
          return ar.length > 3 && (t.includes(ar) || ar.includes(t.split(" ").slice(0, 3).join(" ")));
        });
        return { ...o, inPipeline, evaluatedN: ev?.n };
      }),
    [offers, inboxUrls, appsSnapshot],
  );

  // Nombre d'offres dans la fenêtre de recency sélectionnée — cohérent avec
  // ce que ResultsList affichera (même logique de filtrage que results-list.tsx).
  const filteredCount = useMemo(() => {
    const sd = filters.sinceDays;
    if (!sd || sd <= 0) return enriched.length;
    return enriched.filter((o) => isOfferWithinSinceDays(o.postedAt, sd)).length;
  }, [enriched, filters.sinceDays]);

  const isAi = mode === "ai";
  const isResults = phase === "results";
  const canDiscover = filters.ats.length > 0;
  const scanRunning = running && !isAi;
  // N'afficher la ResultsList qu'après la fin du scan (isResults) — pendant
  // le scan, seul l'écran DiscoveringState est visible pour éviter la confusion
  // entre le compteur de chargement et le nombre d'offres filtrées.
  const showScanList = !isAi && (isResults || phase === "revealing");

  const [clearedSnapshot, setClearedSnapshot] = useState<ExploreFilters | null>(null);

  const clearFilters = () => {
    setClearedSnapshot({ ...filters });
    setFilters({
      ...filters,
      positive: [],
      negative: [],
      allow: [],
      alwaysAllow: [],
      block: [],
      blockHard: [],
    });
  };

  const restoreFilters = () => {
    if (clearedSnapshot) {
      setFilters({ ...clearedSnapshot });
      setClearedSnapshot(null);
    }
  };

  if (running && isAi) return <AiHuntView cliName={cli.name} />;

  return (
    <div className={scanRunning ? undefined : "mx-auto max-w-5xl px-5 py-8 md:px-8"}>
      {scanRunning && <DiscoveringState filteredCount={filteredCount} />}
      {!scanRunning && (
        <>
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <Compass className="size-6 text-brand" />
            <h1 className={`${instrumentSerif.className} text-3xl text-foreground`}>{isFr ? "Explorer" : "Explore"}</h1>
            <span className="rounded-full border border-brand/30 bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-text">
              {isFr ? "Nouveau" : "New"}
            </span>
          </div>
          <div className="w-full sm:ml-auto sm:w-auto">
            <ExploreModeToggle mode={mode} onChange={setMode} cliConfigured={!!cli.id} />
          </div>
        </div>
        {!isResults && (
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
            {isAi
              ? (isFr
                ? "Décrivez le poste en langage naturel — une IA parcourt le web public pour vous. Les résultats sont vérifiés lors de l'évaluation."
                : "Describe the role in plain language — an AI hunts the open web for it, on your own AI. Candidates are unverified until you evaluate.")
              : (isFr
                ? "Explorez vos portails locaux (collectivités, hôpitaux, entreprises du Pas-de-Calais) et les bourses d'emploi. Des offres ciblées pour votre profil dans le 62, 0 jeton dépensé. Vous ne dépensez que lors de l'évaluation."
                : "Scan your local portals, territorial public entities, and recruiting boards. Targeted jobs matched to your area in Pas-de-Calais, zero tokens. You only spend when you choose to evaluate.")}
          </p>
        )}
      </header>

      {!rootExists && (
        <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {isFr
            ? "Votre configuration Jobiify n'est pas encore prête — l'exploration nécessite un profil configuré."
            : "Your Jobiify home isn’t set up yet — discovery needs a checkout with a profile to seed from."}
        </div>
      )}

      {isAi ? (
        phase === "blocked" ? (
          <BlockedCard />
        ) : (
          <div className="space-y-6">
            <AiSearchBox
              intent={aiIntent}
              onIntent={setAiIntent}
              onSubmit={() => void discoverAI()}
              cliConfigured={!!cli.id}
              cliName={cli.name}
              onRunScan={() => setMode("scan")}
            />
            {phase === "results" && <ResultsList offers={enriched} />}
            {phase === "empty-loose" && (
              <EmptyState
                tone="loose"
                title={isFr ? "Aucune correspondance publique pour l'instant." : "No public matches — yet."}
                body={isFr ? "La recherche IA lit le web public. Essayez des critères plus larges, ou lancez un scan des portails." : "AI search reads what's public. Try broader intent, or run the Scan over the ATS network."}
                onRerun={() => setMode("scan")}
                rerunLabel={isFr ? "Lancer le scan des portails" : "Run the Scan"}
              />
            )}
            {phase === "failed" && <FailedCard msg={error || status} scannerMissing={scannerMissing} onRetry={() => void discoverAI()} />}
          </div>
        )
      ) : (
        <>
          <div className="mb-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRefineOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/40 px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover hover:border-brand/40"
                >
                  <Compass className="size-4 text-brand" />
                  <span>{isFr ? "Affiner la recherche" : "Refine search"}</span>
                  <ChevronDown className={cn("size-4 text-muted transition-transform duration-200", refineOpen && "rotate-180")} />
                </button>

                {!isAi && (
                  <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-surface/50 px-3 py-1.5 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium text-muted">
                      <Clock className="size-3.5 text-brand" />
                      {isFr ? "Publié depuis :" : "Posted within:"}
                    </span>
                    <div className="inline-flex rounded-lg border border-border/70 bg-background/60 p-0.5">
                      {recencyList.map((r) => {
                        const active = (filters.sinceDays || 0) === r.days;
                        return (
                          <button
                            key={r.days}
                            type="button"
                            onClick={() => setFilters({ ...filters, sinceDays: r.days })}
                            className={cn(
                              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors max-sm:min-h-11",
                              active
                                ? "bg-brand-soft text-brand font-semibold shadow-xs"
                                : "text-muted hover:text-foreground",
                            )}
                          >
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={!canDiscover || running}
                  onClick={() => void discover()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition-all hover:brightness-110 disabled:opacity-50 max-sm:min-h-11"
                >
                  <RotateCcw className={cn("size-4", running && "animate-spin")} />
                  <span>
                    {isFr
                      ? isResults
                        ? "Relancer le scan"
                        : "Découvrir les offres"
                      : isResults
                        ? "Re-cast"
                        : "Discover offers"}
                  </span>
                </button>
              </div>
            </div>

            {refineOpen && (
              <div className="space-y-4 rounded-xl border border-border bg-surface/30 p-4">
                <FilterBuilder filters={filters} onChange={setFilters} seededFrom={seed.seededFrom} />
                <DiscoverBar
                  canDiscover={canDiscover}
                  onDiscover={discover}
                  onClearFilters={clearFilters}
                  onRestoreFilters={clearedSnapshot ? restoreFilters : undefined}
                  label={
                    isFr
                      ? isResults
                        ? "Appliquer et relancer le scan"
                        : "Appliquer et lancer le scan"
                      : isResults
                        ? "Apply & re-cast"
                        : "Apply & scan"
                  }
                  filters={filters}
                />
              </div>
            )}
          </div>

          {isResults && firstRun && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <Coins className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <p className="text-[13px] leading-relaxed text-foreground">
                {isFr ? (
                  <>Voici les offres en ligne correspondant à votre CV. <span className="font-semibold text-amber-600 dark:text-amber-400">Consomment des jetons IA :</span> l&apos;évaluation approfondie de l&apos;offre et l&apos;adaptation de votre candidature.</>
                ) : (
                  <>These are live roles matching your CV. <span className="font-semibold text-amber-600 dark:text-amber-400">Uses AI tokens:</span> in-depth evaluation and application tailoring.</>
                )}
              </p>
            </div>
          )}


        </>
      )}
      </>
      )}

      {showScanList && (
        <div className={scanRunning ? "relative z-1 mx-auto max-w-5xl px-5 pb-10 md:px-8" : undefined}>
          <ResultsList offers={enriched} />
        </div>
      )}

      {!scanRunning && !isAi && (
        <>
          {phase === "empty-current" && (
            <EmptyState
              tone="good"
              title={isFr ? "Vous êtes complètement à jour." : "You're all caught up."}
              body={isFr ? "Rien de nouveau depuis votre dernier scan. Votre pipeline est à jour — c'est l'objectif !" : "Nothing new since your last scan. Your pipeline is current — that's the goal."}
              onRerun={() => {
                setFilters({ ...filters, sinceDays: Math.max(filters.sinceDays, 30) });
                void discover();
              }}
              rerunLabel={isFr ? "Rechercher sur 30 jours" : "Look back 30 days"}
            />
          )}
          {phase === "empty-loose" && (
            <EmptyState
              tone="loose"
              title={isFr ? "Aucune nouvelle offre pour l'instant." : "No fresh matches — yet."}
              body={isFr ? "Élargissez les critères et relancez la recherche autant que vous le souhaitez." : "Loosen criteria and re-cast as often as you want."}
              onRerun={() => {
                setFilters({ ...filters, sinceDays: 30, block: [], allow: [] });
                void discover();
              }}
              rerunLabel={isFr ? "Élargir à 30 jours · réinitialiser la localisation" : "Widen to 30 days · clear location"}
            />
          )}
          {phase === "degraded" && (
            <DegradedCard
              onRetry={() => void discover()}
              companiesScanned={companiesScanned}
              companiesAvailable={companiesAvailable}
              capHit={capHit}
              droppedNoDate={droppedNoDate}
              partial={partial}
            />
          )}
          {phase === "failed" && <FailedCard msg={error || status} scannerMissing={scannerMissing} onRetry={() => void discover()} />}
        </>
      )}
    </div>
  );
}

function DiscoverBar({
  canDiscover,
  onDiscover,
  label,
  filters,
  onClearFilters,
  onRestoreFilters,
}: {
  canDiscover: boolean;
  onDiscover: () => void;
  label: string;
  filters: ExploreFilters;
  onClearFilters?: () => void;
  onRestoreFilters?: () => void;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const hasAnyFilter =
    filters.positive.length > 0 ||
    filters.negative.length > 0 ||
    filters.allow.length > 0 ||
    filters.alwaysAllow.length > 0 ||
    filters.block.length > 0 ||
    filters.blockHard.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={!canDiscover}
        onClick={onDiscover}
        className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition-all hover:brightness-110 disabled:opacity-50 max-sm:min-h-11"
      >
        <Compass className="size-4" /> {label}
      </button>
      {hasAnyFilter && onClearFilters ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors max-sm:min-h-11"
          title={isFr ? "Effacer tous les critères de recherche" : "Clear all search filters"}
        >
          <Trash2 className="size-4" />
          <span>{isFr ? "Effacer tous les filtres" : "Clear filters"}</span>
        </button>
      ) : onRestoreFilters ? (
        <button
          type="button"
          onClick={onRestoreFilters}
          className="inline-flex items-center gap-1.5 rounded-xl border border-brand/30 bg-brand-soft px-3.5 py-2.5 text-sm font-medium text-brand hover:brightness-110 transition-colors max-sm:min-h-11"
          title={isFr ? "Restaurer les critères précédemment effacés" : "Restore previous filters"}
        >
          <RotateCcw className="size-4" />
          <span>{isFr ? "Restaurer les filtres" : "Restore filters"}</span>
        </button>
      ) : null}
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
        <Coins className="size-3.5 text-amber-500" />
        {isFr
          ? "Consomment des jetons IA : Évaluation approfondie (A–F) et personnalisation de candidature."
          : "Uses AI tokens: In-depth evaluation (A–F) and application tailoring."}
      </span>
    </div>
  );
}

function EmptyState({ tone, title, body, onRerun, rerunLabel }: { tone: "good" | "loose"; title: string; body: string; onRerun: () => void; rerunLabel: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/30 px-6 py-12 text-center">
      <div className={cn("mx-auto grid size-12 place-items-center rounded-full", tone === "good" ? "bg-emerald-500/12 text-emerald-500" : "bg-brand-soft text-brand")}>
        <Sparkles className="size-6" />
      </div>
      <h2 className={`${instrumentSerif.className} mt-4 text-2xl text-foreground`}>{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{body}</p>
      <button onClick={onRerun} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand">
        <RotateCcw className="size-4" /> {rerunLabel}
      </button>
    </div>
  );
}

function DegradedCard({
  onRetry,
  companiesScanned,
  companiesAvailable,
  capHit,
  droppedNoDate,
  partial,
}: {
  onRetry: () => void;
  companiesScanned: number;
  companiesAvailable: number;
  capHit: boolean;
  droppedNoDate: number;
  partial: boolean;
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  let title = isFr ? "Le scan a tourné, mais n'a pu joindre aucune source." : "The scan ran, but couldn’t reach any sources.";
  let body = isFr
    ? "Les répertoires ATS publics n'ont pas répondu — généralement un souci réseau passager. Réessayez dans un instant."
    : "The public ATS directories didn’t respond — usually a transient network hiccup or rate-limit, so nothing could be searched. This isn’t “all caught up”; a retry in a moment usually clears it.";
  if (companiesScanned > 0 && capHit) {
    title = isFr ? "Aucune correspondance dans l'échantillon analysé." : "No matches in the slice we searched.";
    body = isFr
      ? `Le scan est limité à ${companiesScanned.toLocaleString()}${companiesAvailable > companiesScanned ? ` sur ${companiesAvailable.toLocaleString()}` : ""} entreprises. Augmentez la profondeur de scan ou ajustez vos critères.`
      : `The scan is capped, so it only searched ${companiesScanned.toLocaleString()}${companiesAvailable > companiesScanned ? ` of ${companiesAvailable.toLocaleString()}` : ""} companies — not the whole network. Raise scan depth (Refine search) or narrow your roles, then re-cast to look deeper.`;
  } else if (companiesScanned > 0 && droppedNoDate > 0) {
    title = isFr ? "Des offres sans date de publication ont été ignorées." : "Fresh-looking roles were skipped for missing dates.";
    body = isFr
      ? `${droppedNoDate.toLocaleString()} offre${droppedNoDate > 1 ? "s correspondaient" : " correspondait"} mais n'avaient pas de date de parution claire.`
      : `${droppedNoDate.toLocaleString()} posting${droppedNoDate === 1 ? "" : "s"} matched but had no clear publish date, so the freshness filter dropped them. Widening the time window often brings dated equivalents back.`;
  } else if (companiesScanned > 0 && partial) {
    title = isFr ? "Certains sites d'emploi étaient inaccessibles." : "Some job boards were unreachable.";
    body = isFr
      ? `Le scan a analysé ${companiesScanned.toLocaleString()} entreprises, mais une ou plusieurs sources n'ont pas répondu.`
      : `The scan searched ${companiesScanned.toLocaleString()} companies, but one or more sources didn’t respond — so this is a partial result, not “all caught up”. A retry usually clears it.`;
  }
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
      <AlertTriangle className="mx-auto size-6 text-amber-500" />
      <p className="mt-2 text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-muted">{body}</p>
      <button onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand-soft px-3 py-1.5 text-sm font-medium text-brand">
        <RotateCcw className="size-4" /> {isFr ? "Réessayer le scan" : "Retry the scan"}
      </button>
    </div>
  );
}


function FailedCard({ msg, scannerMissing, onRetry }: { msg: string; scannerMissing: boolean; onRetry: () => void }) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  if (scannerMissing) {
    return (
      <div className="rounded-2xl border border-border bg-surface/30 px-6 py-10 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
          <Compass className="size-6" />
        </div>
        <h2 className={`${instrumentSerif.className} mt-4 text-2xl text-foreground`}>
          {isFr ? "La découverte nécessite la suite complète" : "Discovery needs the full toolkit"}
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
          {isFr
            ? "Mettez à jour Jobiify, ou collez l'URL d'une offre directement dans le pipeline pour l'évaluer."
            : "Your Jobiify home looks data-only or is on an older version. The free scanner ships with a complete checkout — update Jobiify, or paste a job URL on the pipeline to evaluate it directly."}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/pipeline" className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-brand-foreground transition hover:brightness-110">
            {isFr ? "Ouvrir le pipeline" : "Open pipeline"}
          </Link>
          <Link href="/config" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground transition hover:border-brand/40 hover:text-brand">
            {isFr ? "Ouvrir la configuration" : "Open Config"}
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
      <AlertTriangle className="mx-auto size-6 text-amber-500" />
      <p className="mt-2 text-sm font-medium text-foreground">{isFr ? "Impossible de terminer la recherche." : "Couldn’t finish the search."}</p>
      <p className="mt-1 text-[13px] text-muted">{msg}</p>
      <button onClick={onRetry} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand-soft px-3 py-1.5 text-sm font-medium text-brand">
        <RotateCcw className="size-4" /> {isFr ? "Réessayer" : "Try again"}
      </button>
    </div>
  );
}

function BlockedCard() {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  return (
    <div className="rounded-2xl border border-border bg-surface/30 px-6 py-12 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
        <Sparkles className="size-6" />
      </div>
      <h2 className={`${instrumentSerif.className} mt-4 text-2xl text-foreground`}>
        {isFr ? "La recherche IA nécessite une CLI" : "AI search needs a CLI"}
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
        {isFr
          ? "Connectez Claude Code, Gemini ou toute CLI d'agent — votre clé, vos tokens, votre machine. Le scan des portails reste utilisable sans CLI."
          : "Connect Claude Code, Gemini, or any agent CLI — your key, your tokens, your machine. Portal scan stays available without one."}
      </p>
      <Link href="/config" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-brand-foreground transition hover:brightness-110">
        <Settings className="size-4" /> {isFr ? "Ouvrir la configuration" : "Open Config"}
      </Link>
    </div>
  );
}
