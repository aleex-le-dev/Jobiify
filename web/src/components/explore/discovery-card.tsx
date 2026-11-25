"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, Check, CheckCheck, Loader2, Coins, MapPin, Calendar, Target, Undo2, ListPlus, ListMinus } from "lucide-react";
import { cn } from "@/lib/cn";
import { type DiscoveredOffer, offerSourceLabel } from "@/lib/explore";
import { useJobs } from "@/components/jobs/job-store";
import { useExplore } from "./explore-provider";
import { MoreMenu, type MoreMenuItem } from "./more-menu";
import { markOf, MARK_LABEL, type Mark } from "@/lib/offer-marks.mjs";
import { contractOf } from "@/lib/offer-match.mjs";
import { isHttpUrl } from "@/lib/env-safety.mjs";
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

// Annonces ouvertes depuis Jobiify, en attente d'une réponse à « Avez-vous postulé ? ».
const OPENED_KEY = "jobiify:opened-offers";
function readOpened(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(OPENED_KEY) || "[]");
    return Array.isArray(v) ? v.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}
function writeOpened(urls: string[]) {
  try {
    sessionStorage.setItem(OPENED_KEY, JSON.stringify(urls.slice(-200)));
  } catch {
    /* sans stockage : la question reste valable tant que la carte est affichée */
  }
}

// What a running worker is doing on this exact posting → the live CTA label.
const WORKER_LABEL_EN: Record<string, string> = { evaluate: "Evaluating…", pdf: "Preparing CV…", research: "Researching…", apply: "Filling…" };
const WORKER_LABEL_FR: Record<string, string> = { evaluate: "Évaluation en cours…", pdf: "Génération CV…", research: "Recherche en cours…", apply: "Remplissage…" };

export function DiscoveryCard({ offer, inPipeline, evaluatedN }: { offer: DiscoveredOffer; inPipeline: boolean; evaluatedN?: string }) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const { added, adding, removed, addToPipeline, removeFromPipeline, marks, markOffers } = useExplore();
  const mark = markOf(marks, offer) as Mark | undefined;
  const contract = contractOf(offer);
  const safeUrl = isHttpUrl(offer.url) ? offer.url : undefined; // jamais javascript: ou data: dans un lien
  const { jobs, startJob } = useJobs();
  const [opened, setOpened] = useState(false);
  useEffect(() => setOpened(readOpened().includes(offer.url)), [offer.url]);
  const setOpenedPersist = (v: boolean) => {
    setOpened(v);
    const rest = readOpened().filter((u) => u !== offer.url);
    writeOpened(v ? [...rest, offer.url] : rest);
  };
  // L'annonce s'ouvre sur le site de l'employeur : Jobiify demandera ensuite si vous avez postulé.
  const onOpenAd = () => {
    if (!mark) setOpenedPersist(true);
  };

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

  const moreItems: MoreMenuItem[] = [
    ...(mark !== "applied" ? [{ key: "applied", text: "Déjà postulé", icon: CheckCheck, onSelect: () => void markOffers([offer], "applied"), hint: "ajoute au suivi" }] : []),
    inSel
      ? { key: "unselect", text: "Retirer de ma sélection", icon: ListMinus, onSelect: () => void removeFromPipeline([offer.url]) }
      : { key: "select", text: "Mettre de côté (ma sélection)", icon: ListPlus, onSelect: () => void addToPipeline([offer]) },
    { key: "evaluate", text: "Évaluer avec l'IA", icon: Coins, onSelect: evaluate, hint: "jetons" },
  ];

  return (
    <div className="co-rise group flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-surface/40 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <Logo company={offer.company} />
        <a href={safeUrl} target="_blank" rel="noopener noreferrer" onClick={onOpenAd} className="block min-w-0 flex-1 max-sm:min-h-[44px]">
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
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpenAd}
          title="Ouvrir l'annonce"
          aria-label="Ouvrir l'annonce"
          className="-m-1 inline-flex shrink-0 items-center justify-center rounded p-1 text-faint transition-colors hover:text-foreground max-sm:min-h-[44px] max-sm:min-w-[44px]"
        >
          <ExternalLink className="size-4" />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
        {(offer.fit?.band === "strong" || offer.fit?.band === "related") && (
          <span
            title={
              isFr
                ? "Estimation gratuite d'après l'intitulé et les postes de votre profil. L'évaluation donne la vraie note."
                : "Free estimate from the title and your profile's roles. Evaluation gives the real grade."
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
              offer.fit.band === "strong"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
            )}
          >
            <Target className="size-3" />
            {offer.fit.band === "strong" ? (isFr ? "Très proche du profil" : "Strong match") : isFr ? "Proche du profil" : "Related"}
          </span>
        )}
        <span className="inline-flex items-center rounded-md border border-brand/20 bg-brand-soft/50 px-2 py-0.5 text-[11px] font-medium text-brand">
          {offerSourceLabel(offer, isFr)}
        </span>
        {contract && !(offer.note || "").toLowerCase().includes(contract.toLowerCase()) && (
          <span className="inline-flex items-center rounded-md border border-border bg-surface-hover/70 px-2 py-0.5 text-[11px] font-semibold text-foreground">{contract}</span>
        )}
        {mark && (
          <span className="inline-flex items-center rounded-md border border-border bg-surface-hover px-2 py-0.5 text-[11px] font-semibold text-foreground">
            {MARK_LABEL[mark]}
          </span>
        )}
        {offer.note && (
          <span className="inline-flex max-w-full items-center rounded-md border border-border bg-surface-hover/50 px-2 py-0.5 text-[11px] font-medium text-foreground/80" title={offer.note}>
            <span className="truncate">{offer.note}</span>
          </span>
        )}
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
        ) : opened && !mark ? (
          <div className="rounded-md border border-brand/30 bg-brand-soft/40 px-3 py-2.5" role="group" aria-label="Avez-vous postulé ?">
            <p className="text-[13px] font-medium text-foreground">Avez-vous postulé ?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpenedPersist(false);
                  void markOffers([offer], "applied");
                }}
                className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-brand px-2.5 py-2 text-xs font-semibold text-brand-foreground transition hover:brightness-110 max-sm:min-h-[44px]"
              >
                <CheckCheck className="size-3.5" /> Oui, j&apos;ai postulé
              </button>
              <button
                type="button"
                onClick={() => setOpenedPersist(false)}
                className="inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-md border border-border px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover max-sm:min-h-[44px]"
              >
                Pas encore
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {mark ? (
              <>
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-surface-hover px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-brand-soft hover:text-brand max-sm:min-h-[44px]"
                >
                  <ExternalLink className="size-3.5" /> Ouvrir l&apos;annonce
                </a>
                <button
                  type="button"
                  onClick={() => void markOffers([offer], null)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand max-sm:min-h-[44px]"
                >
                  <Undo2 className="size-3.5" /> Remettre dans les nouvelles
                </button>
              </>
            ) : (
              <>
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onOpenAd}
                  title="Ouvre l'annonce sur le site de l'employeur"
                  className="inline-flex flex-[1.4] items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-brand px-2.5 py-2 text-xs font-semibold text-brand-foreground shadow-sm transition hover:brightness-110 max-sm:min-h-[44px]"
                >
                  {isFr ? "Postuler" : "Apply"} <ExternalLink className="size-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => void markOffers([offer], "dismissed")}
                  className="inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-md border border-border px-2.5 py-2 text-xs font-medium text-muted transition-colors hover:border-rose-400/40 hover:text-rose-600 dark:hover:text-rose-400 max-sm:min-h-[44px]"
                >
                  {isFr ? "Pas intéressé" : "Not interested"}
                </button>
              </>
            )}
            <MoreMenu label={isFr ? "Autres actions" : "More actions"} items={moreItems} />
          </div>
        )}
      </div>
    </div>
  );
}
