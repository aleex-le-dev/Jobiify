"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Plus, Check, Loader2, Coins, MapPin, Calendar } from "lucide-react";
import { cn } from "@/lib/cn";
import { type DiscoveredOffer, offerSourceLabel } from "@/lib/explore";
import { useJobs } from "@/components/jobs/job-store";
import { useExplore } from "./explore-provider";
import { formatLocationCity, formatPublicationDate } from "@/lib/format";

import { useI18n } from "@/components/i18n-provider";


// Real company logo (favicon) via the localhost proxy, cached on disk FOREVER per
// company — so once it resolves it's instant for this card AND every other card,
// this search or any future one. Falls back to a monogram on miss.
function Logo({ company }: { company: string }) {
  const [failed, setFailed] = useState(false);
  const letter = (company || "?").trim().charAt(0).toUpperCase();
  if (failed || !company.trim()) {
    return <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-sm font-semibold text-brand">{letter}</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/logo?company=${encodeURIComponent(company)}`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-9 shrink-0 rounded-lg border border-border bg-surface object-contain p-1"
    />
  );
}

// What a running worker is doing on this exact posting → the live CTA label.
const WORKER_LABEL_EN: Record<string, string> = { evaluate: "Evaluating…", pdf: "Preparing CV…", research: "Researching…", apply: "Filling…" };
const WORKER_LABEL_FR: Record<string, string> = { evaluate: "Évaluation en cours…", pdf: "Génération CV…", research: "Recherche en cours…", apply: "Remplissage…" };

export function DiscoveryCard({ offer, inPipeline, evaluatedN }: { offer: DiscoveredOffer; inPipeline: boolean; evaluatedN?: string }) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { added, adding, removed, addToPipeline, removeFromPipeline } = useExplore();
  const { jobs, startJob } = useJobs();

  // GLOBAL worker awareness: any worker acting on this URL drives the CTA, here
  // and on every other surface that renders this offer (the jobs store is global).
  const job = useMemo(
    () => jobs.filter((j) => j.input === offer.url).sort((a, b) => b.startedAt - a.startedAt)[0],
    [jobs, offer.url],
  );
  const working = job?.status === "running";
  const doneEval = job?.status === "done" && job.kind === "evaluate";
  const workerMap = isFr ? WORKER_LABEL_FR : WORKER_LABEL_EN;
  const statusLabel = workerMap[job?.kind ?? ""] ?? (isFr ? "En cours…" : "Working…");

  const inSel = (added.has(offer.url) || inPipeline) && !removed?.has(offer.url);
  const isAdded = inSel || working || doneEval;
  const isAdding = adding?.has?.(offer.url) ?? false;
  const fresh = offer.postedHint || "";
  const city = useMemo(() => formatLocationCity(offer.location), [offer.location]);
  const pubInfo = useMemo(() => formatPublicationDate(offer.postedAt, isFr), [offer.postedAt, isFr]);
  const displayTitle = useMemo(() => {
    let t = (offer.title || "").trim();
    // Enlever préfixes administratifs / police incluant villes composées (ex: CPN Berck-sur-Mer -, CPN Béthune -)
    t = t.replace(/^(?:CPN|DIPN)\b[^-]*-\s*/i, "");
    // Enlever les suffixes de collectivité/lieu en majuscules (ex: - MAIRIE DE COURRIERES, - COMMUNAUTE D'AGGLOMERATION...)
    t = t.replace(
      /\s+-\s+(?:MAIRIE\s+DE\s+|VILLE\s+DE\s+|COMMUNAUTE\s+D['’]AGGLOMERATION\s+|COMMUNAUTE\s+DE\s+COMMUNES\s+|CONSEIL\s+DEPARTEMENTAL\s+|CONSEIL\s+REGIONAL\s+|CENTRE\s+DE\s+GESTION\s+|SDIS\s+|PREFECTURE\s+|SYNDICAT\s+|CU\s+D['’]|CA\s+|SGC\s+|CDG\s+|EHPAD\s+|CH\s+|METROPOLE\s+).+$/i,
      "",
    );
    t = t.replace(/\s+-\s+.*(?:MAIRIE|AGGLOMERATION|COMMUNAUTE|DEPARTEMENT|PREFECTURE|VILLE|LE TOUQUET|MONTREUIL).*$/i, "");
    // Enlever les mentions de genre (H/F, F/H, (H/F), etc.)
    t = t.replace(/\s*\(?[HF]\s*\/\s*[HF]\)?\s*$/i, "").trim();

    // Si le titre restant était tout en majuscules, le passer en casse naturelle avec majuscule initiale
    if (t.length > 3 && t === t.toUpperCase()) {
      t = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    } else if (t.length > 0) {
      t = t.charAt(0).toUpperCase() + t.slice(1);
    }
    return t;
  }, [offer.title]);

  const displayCompany = useMemo(() => {
    const raw = (offer.company || "").trim();
    if (/^communes?$/i.test(raw)) {
      const pureCity = (city || "").replace(/\s*\(\d+\)/, "").trim();
      return pureCity ? `Mairie de ${pureCity}` : "Mairie";
    }
    if (/^structures? de coop[ée]ration.*$/i.test(raw)) {
      return "Intercommunalité (62)";
    }
    if (/^conseils? d[ée]partementaux.*$/i.test(raw)) {
      return "Conseil Départemental du Pas-de-Calais";
    }
    return raw;
  }, [offer.company, city]);

  const evaluate = () => {
    addToPipeline([offer]); // evaluating implies it's in the pipeline — record it
    startJob({ title: `Evaluate · ${offer.company}`, subtitle: offer.title, kind: "evaluate", input: offer.url, page: "/explore" });
  };

  return (
    <div className="co-rise group flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-surface/40 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <Logo company={offer.company} />
        <a href={offer.url} target="_blank" rel="noopener noreferrer" className="block min-w-0 flex-1 max-sm:min-h-[44px]">
          <h3 className="text-[14px] sm:text-[14.5px] font-semibold leading-snug break-words text-foreground transition-colors group-hover:text-brand">
            {displayTitle}
          </h3>
          <p className="mt-1 text-[12.5px] font-normal leading-snug break-words text-foreground/80" title={displayCompany}>
            {displayCompany}
          </p>
          {city && (
            <p
              className="mt-0.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted break-words"
              title={offer.location && offer.location !== city ? offer.location : undefined}
            >
              <MapPin className="mt-0.5 size-3 shrink-0 text-brand" />
              <span className="break-words">{city}</span>
            </p>
          )}
        </a>
        <a
          href={offer.url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open the posting"
          aria-label="Open the posting"
          className="-m-1 inline-flex shrink-0 items-center justify-center rounded p-1 text-faint transition-colors hover:text-foreground max-sm:min-h-[44px] max-sm:min-w-[44px]"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
        <span className="inline-flex items-center rounded-md border border-brand/20 bg-brand-soft/50 px-2 py-0.5 text-[11px] font-medium text-brand">
          {offerSourceLabel(offer, isFr)}
        </span>
        {pubInfo.label ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-hover/70 px-2 py-0.5 font-medium text-foreground/85"
            title={
              pubInfo.formattedDate
                ? isFr
                  ? `Date de publication : ${pubInfo.formattedDate}${pubInfo.time ? ` à ${pubInfo.time}` : ""}`
                  : `Publication date: ${pubInfo.formattedDate}${pubInfo.time ? ` at ${pubInfo.time}` : ""}`
                : undefined
            }
          >
            <Calendar className="size-3 text-brand shrink-0" />
            {pubInfo.label}
          </span>
        ) : offer.source === "sirene-pme-62" || offer.source === "la-bonne-boite-pme" ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-hover/50 px-2 py-0.5 font-medium text-muted">
            {isFr ? "Candidature spontanée" : "Spontaneous application"}
          </span>
        ) : fresh ? (
          <span className="text-faint">{fresh}</span>
        ) : null}
      </div>

      <div className="mt-0.5">
        {evaluatedN || doneEval ? (
          <a
            href={evaluatedN ? `/pipeline/${evaluatedN}` : job ? `/jobs/${job.id}` : "/pipeline"}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-soft px-2.5 py-2 text-xs font-medium text-brand max-sm:min-h-[44px]"
          >
            <Check className="size-3.5" /> {isFr ? "Évalué · voir le rapport" : "Evaluated · view report"}
          </a>
        ) : working ? (
          <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-brand/30 bg-brand-soft/60 px-2.5 py-2 text-xs font-medium text-brand">
            <Loader2 className="size-3.5 animate-spin" />
            {statusLabel}
            <span className="text-brand/60">· {isFr ? "dans ma sélection" : "in selection"}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isAdding}
              onClick={() => {
                if (inSel) {
                  void removeFromPipeline([offer.url]);
                } else {
                  void addToPipeline([offer]);
                }
              }}
              title={
                inSel
                  ? (isFr ? "Cliquer pour retirer de ma sélection" : "Click to remove from selection")
                  : (isFr ? "Ajouter à ma sélection" : "Add to selection")
              }
              className={cn(
                "group/btn inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-xs font-medium transition-colors max-sm:min-h-[44px]",
                inSel
                  ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-600 dark:text-emerald-400 dark:hover:text-rose-400"
                  : "bg-surface-hover text-foreground hover:bg-brand-soft hover:text-brand",
              )}
            >
              {isAdding ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : inSel ? (
                <>
                  <Check className="size-3.5 group-hover/btn:hidden" />
                  <span className="hidden text-xs font-bold leading-none group-hover/btn:inline text-rose-500">✕</span>
                  <span className="group-hover/btn:hidden">{isFr ? "Dans ma sélection" : "In selection"}</span>
                  <span className="hidden group-hover/btn:inline">{isFr ? "Retirer" : "Remove"}</span>
                </>
              ) : (
                <>
                  <Plus className="size-3.5" />
                  <span>{isFr ? "Ajouter à ma sélection" : "Add to selection"}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={evaluate}
              title={isFr ? "Évaluation approfondie A–F (consomme des jetons IA)." : "In-depth A–F evaluation (uses AI tokens)."}
              className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-brand/30 px-2.5 py-2 text-xs font-medium text-brand transition-colors hover:bg-brand-soft max-sm:min-h-[44px]"
            >
              {isFr ? "Évaluer" : "Evaluate"} <Coins className="size-3.5 text-amber-500" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
