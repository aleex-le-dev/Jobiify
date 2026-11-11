"use client";

import { fr } from "@/lib/fr-system";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CircleHelp, Sparkles, ArrowRight, Search, Inbox, Send, ListTodo } from "lucide-react";
import { displayFont } from "@/lib/fonts";
import type { Application, InboxJob } from "@/lib/career-ops";
import type { DiscoveredOffer } from "@/lib/explore";
import { DiscoveryCard } from "@/components/explore/discovery-card";
import { FollowUpCard, type FollowUp } from "@/components/home/follow-up-card";
import { DecisionCard } from "@/components/home/decision-card";
import type { CardReason } from "@/lib/machine-summary.mjs";
import { QuickEvaluate } from "@/components/quick-evaluate";
import { FollowupsDueSectionSkeleton } from "@/components/page-loading-skeletons";
import { scoreNum } from "@/lib/format";
import { pickAwaitingDecision, groupAwaiting } from "@/lib/home/awaiting.mjs";
import { companyPresentation } from "@/lib/company-presentation.mjs";
import { resolveHeroState, mayClaimAllClear, showsQueue, missingSourceLabel, displayCounts } from "@/lib/home/hero-state.mjs";
import { useI18n } from "@/components/i18n-provider";
import { CountUp } from "@/components/ui/count-up";
import { ProfileOverview, type SourceStatus } from "@/components/home/profile-overview";
import type { CvSummary, SearchProfile } from "@/lib/search-profile-types";

// The retention "Today": a dual-loop action queue (the maintainer's
// "N new matches this week · M follow-ups due"). SUPPLY loop = fresh free-scan
// matches (zero tokens, /api/whats-new); DEMAND loop = follow-ups due
// (/api/followups). Each item one-tap actionable. Home stays a VIEW over the
// canonical files — every action dispatches a real registry action / route.
export function TodayDashboard({
  applications,
  reasons,
  legitimacy,
  inbox,
  inBetween,
  profiles,
  activeProfileId,
  summaries,
  sources,
}: {
  applications: Application[];
  reasons: Record<string, CardReason>;
  /** Block-G legitimacy per report number, read by the page from each report. */
  legitimacy: Record<string, string>;
  inbox: Pick<InboxJob, "url" | "done">[];
  inBetween: boolean;
  profiles: SearchProfile[];
  activeProfileId: string | null;
  summaries: Record<string, CvSummary>;
  sources: SourceStatus[];
}) {
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [overdue, setOverdue] = useState(0);
  const [followupsLoading, setFollowupsLoading] = useState(true);
  const [followupsError, setFollowupsError] = useState(false);
  const [followupsEnabled, setFollowupsEnabled] = useState(true);
  const [upcoming, setUpcoming] = useState<FollowUp[]>([]);
  const [fresh, setFresh] = useState<DiscoveredOffer[]>([]);
  const [freshCount, setFreshCount] = useState(0);
  const [freshLoading, setFreshLoading] = useState(true);
  const [freshError, setFreshError] = useState(false);
  const requestGeneration = useRef(0);
  const router = useRouter();
  const { locale, t } = useI18n();
  const isFr = locale === "fr";
  const dateLabel = useMemo(() => new Date().toLocaleDateString(isFr ? "fr-FR" : "en-US", { weekday: "long", month: "short", day: "numeric" }), [isFr]);

  const refetch = useCallback(() => {
    const generation = ++requestGeneration.current;
    const isLatest = () => generation === requestGeneration.current;
    setFollowupsLoading(true);
    setFollowupsError(false);
    fetch("/api/followups")
      .then((r) => {
        if (!r.ok) throw new Error("Follow-ups request failed");
        return r.json();
      })
      .then((d) => {
        if (!isLatest()) return;
        // The cadence route reports engine failures as HTTP 200 with
        // available:false; that is unavailable, not an empty action queue.
        if (d.available === false) throw new Error("Follow-ups unavailable");
        // /api/followups already filters to urgency 'urgent'/'overdue' — due
        // now, never 'waiting'/'cold' (#86). Both count toward "due"; a
        // missing metadata.overdue must read as 0 due, never as "every entry
        // is overdue" (the old `?? d.entries?.length` fallback).
        setFollowups(Array.isArray(d.entries) ? d.entries : []);
        setOverdue((d.metadata?.overdue ?? 0) + (d.metadata?.urgent ?? 0));
        setFollowupsEnabled(d.followupsEnabled !== false);
        setUpcoming(Array.isArray(d.upcoming) ? d.upcoming : []);
      })
      .catch(() => { if (isLatest()) setFollowupsError(true); })
      .finally(() => { if (isLatest()) setFollowupsLoading(false); });
    setFreshLoading(true);
    setFreshError(false);
    fetch("/api/whats-new")
      .then((r) => {
        if (!r.ok) throw new Error("Fresh matches request failed");
        return r.json();
      })
      .then((d) => {
        if (!isLatest()) return;
        const offers = Array.isArray(d.offers) ? d.offers : [];
        const count = Number(d.count);
        setFresh(offers);
        setFreshCount(Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : offers.length);
      })
      .catch(() => { if (isLatest()) setFreshError(true); })
      .finally(() => { if (isLatest()) setFreshLoading(false); });
  }, []);

  useEffect(() => {
    refetch();
    // A worker (evaluate/pdf) just wrote a real tracker row — refresh the server
    // snapshot (applications/inbox props) + the client loops so the freshly-scored
    // role appears in "Awaiting your decision" without a manual reload.
    const onDone = () => {
      router.refresh();
      refetch();
    };
    window.addEventListener("co-job-done", onDone);
    return () => {
      window.removeEventListener("co-job-done", onDone);
      requestGeneration.current += 1;
    };
  }, [refetch, router]);

  // Awaiting decision: scored (Evaluated) but no terminal status yet. The
  // ordering lives in lib/home/awaiting.mjs so it can be tested — see the file
  // for why "first six in the array" was a bug waiting for #3529.
  const awaiting = useMemo(() => pickAwaitingDecision(applications, scoreNum), [applications]);
  // With the legitimacy, a flagged posting is grouped as the report page
  // labels it (#5300), so "Apply next" below never points at one.
  const awaitingGroups = useMemo(() => groupAwaiting(awaiting, (a) => legitimacy[a.n]), [awaiting, legitimacy]);
  const recommended = awaitingGroups.find(([label]) => label === "Recommended")?.[1] ?? [];

  const newThisWeek = freshCount;
  const dataLoading = followupsLoading || freshLoading;
  const dataError = followupsError || freshError;
  // Derived from the flags refetch() already maintains — no second fetch loop
  // and no second source of truth. The only thing added is the distinction
  // dataError cannot make: a failure with known work still has a queue to show.
  const heroState = resolveHeroState({
    followupsLoading,
    freshLoading,
    followupsError,
    freshError,
    overdue,
    newThisWeek,
    awaitingCount: awaiting.length,
  });
  const allClear = mayClaimAllClear(heroState);
  const missingSources = missingSourceLabel({ followupsError, freshError });
  // Printed instead of the raw state: refetch() leaves the previous count in
  // place when a source fails, so `overdue` can still hold a number from before
  // the outage. See displayCounts().
  const shown = displayCounts({ followupsError, freshError, overdue, newThisWeek });
  const inboxUrls = useMemo(() => new Set(inbox.map((j) => j.url)), [inbox]);

  // ── Contexte du jour ──
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null;
  const firstName = ((activeProfile && summaries[activeProfile.id]?.person) || "").split(/\s+/)[0] || "";
  const hour = new Date().getHours();
  const greeting = isFr ? (hour >= 18 ? "Bonsoir" : "Bonjour") : hour >= 18 ? "Good evening" : "Hello";
  const inboxPending = inbox.filter((j) => !j.done).length;
  const statusOf = (a: Application) => (a.status || "").toLowerCase();
  const SENT = new Set(["applied", "responded", "assessment", "interview", "offer", "hired", "rejected"]);
  const sentCount = applications.filter((a) => SENT.has(statusOf(a))).length;
  const interviewCount = applications.filter((a) => ["interview", "assessment", "offer"].includes(statusOf(a))).length;
  const summaryParts: string[] = [];
  if (shown.newThisWeek > 0) summaryParts.push(isFr ? `${shown.newThisWeek} nouvelle(s) offre(s) cette semaine` : `${shown.newThisWeek} new match(es) this week`);
  if (shown.overdue > 0) summaryParts.push(isFr ? `${shown.overdue} relance(s) à faire` : `${shown.overdue} follow-up(s) due`);
  if (awaiting.length > 0) summaryParts.push(isFr ? `${awaiting.length} offre(s) en attente de décision` : `${awaiting.length} awaiting a decision`);
  const summaryLine = summaryParts.length
    ? summaryParts.join(" · ") + "."
    : isFr ? "Votre plan d'action du jour, réuni au même endroit." : "Your action plan for today, in one place.";

  const offSources = sources.filter((x) => x.status === "unconfigured" || x.status === "broken");
  const nextSteps: Array<{ key: string; title: string; detail: string; href: string }> = [];
  if (!activeProfile) {
    nextSteps.push({ key: "profile", title: isFr ? "Créer votre profil de recherche" : "Create your search profile", detail: isFr ? "Importez un CV : postes, synonymes et zone créés automatiquement." : "Import a CV to generate roles and zone.", href: "/cv" });
  } else if (activeProfile.titles.length === 0) {
    nextSteps.push({ key: "titles", title: isFr ? "Ajouter des postes au profil" : "Add roles to the profile", detail: isFr ? `« ${activeProfile.name} » n'a encore aucun poste à rechercher.` : "This profile has no roles yet.", href: "/cv" });
  }
  if (offSources.some((x) => x.id === "france-travail")) {
    nextSteps.push({ key: "ft", title: isFr ? "Activer France Travail" : "Enable France Travail", detail: isFr ? "La source n°1 : offres France Travail + HelloWork, Indeed, intérim. Clé gratuite." : "The main source — free API key.", href: "/portals" });
  } else if (offSources.length > 0) {
    nextSteps.push({ key: "sources", title: isFr ? `Activer ${offSources.length} source(s) gratuite(s)` : `Enable ${offSources.length} free source(s)`, detail: offSources.map((x) => x.name.split(" (")[0]).slice(0, 3).join(", "), href: "/portals" });
  }
  if (shown.overdue > 0) {
    nextSteps.push({ key: "followups", title: isFr ? `Faire ${shown.overdue} relance(s)` : `Send ${shown.overdue} follow-up(s)`, detail: isFr ? "Une relance au bon moment fait souvent la différence." : "A timely nudge beats silence.", href: "/followups" });
  }
  if (inboxPending > 0) {
    nextSteps.push({ key: "triage", title: isFr ? `Trier ${inboxPending} offre(s) de ma sélection` : `Triage ${inboxPending} saved offer(s)`, detail: isFr ? "Évaluez ou écartez les offres mises de côté." : "Evaluate or discard saved offers.", href: "/pipeline" });
  }
  if (activeProfile && shown.newThisWeek === 0 && inboxPending === 0) {
    nextSteps.push({ key: "search", title: isFr ? "Lancer une recherche avec ce profil" : "Run a search with this profile", detail: isFr ? `${activeProfile.titles.length + activeProfile.synonyms.length} intitulés, ${activeProfile.commuteMinutes} min autour de ${activeProfile.originCity}.` : "Search every source with this profile.", href: "/explore?run=1" });
  }
  if (nextSteps.length < 4) {
    nextSteps.push({ key: "alerts", title: isFr ? "Recevoir LinkedIn et HelloWork par e-mail" : "Get LinkedIn & HelloWork by email", detail: isFr ? "Créez des alertes autour de Lillers : elles sont lues et filtrées sur votre zone." : "Create email alerts; they get filtered to your zone.", href: "/portals" });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 max-sm:pb-24">
      {/* ── En-tête : date, salutation, synthèse du jour, action principale ── */}
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">
            {isFr ? "Aujourd'hui" : "Today"} · <span className="tabular-nums">{dateLabel}</span>
          </p>
          <h1 className={`${displayFont.className} mt-1.5 text-3xl font-semibold leading-tight text-landing md:text-[2.15rem]`}>
            {greeting}
            {firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="mt-1.5 text-[14px] text-muted">
            {heroState === "loading"
              ? isFr ? "Chargement de votre journée…" : "Loading your day…"
              : heroState === "unavailable"
                ? isFr ? "Certaines mises à jour sont indisponibles." : "Some updates are unavailable."
                : allClear
                  ? isFr ? "Rien d'urgent : c'est le bon moment pour lancer une recherche." : "Nothing urgent — a good time to run a search."
                  : summaryLine}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/explore?run=1"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition hover:bg-brand-200 max-sm:min-h-[44px]"
          >
            <Search className="size-4" />
            {activeProfile ? (isFr ? "Rechercher avec ce profil" : "Search with this profile") : isFr ? "Découvrir des offres" : "Find new roles"}
          </Link>
          <Link
            href="/pipeline"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-xs transition hover:bg-surface-hover max-sm:min-h-[44px]"
          >
            {isFr ? "Mes candidatures" : "My applications"}
          </Link>
        </div>
      </header>

      {/* ── Profil pris en compte + sources ── */}
      <div className="mt-6">
        <ProfileOverview profiles={profiles} activeId={activeProfileId} summaries={summaries} sources={sources} />
      </div>

      {/* ── Indicateurs clés ── */}
      <section className="stagger mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={isFr ? "Indicateurs" : "Key figures"}>
        <Kpi
          icon={Sparkles}
          label={isFr ? "Nouvelles offres · 7 j" : "New matches · 7d"}
          value={freshLoading ? null : freshError ? "—" : shown.newThisWeek}
          href="/explore?view=fresh"
          accent={shown.newThisWeek > 0}
        />
        <Kpi icon={Inbox} label={isFr ? "À trier dans ma sélection" : "To triage"} value={inboxPending} href="/pipeline" accent={inboxPending > 0} />
        <Kpi icon={Send} label={isFr ? "Candidatures envoyées" : "Applications sent"} value={sentCount} href="/pipeline" hint={interviewCount ? `${interviewCount} ${isFr ? "en entretien" : "interviewing"}` : undefined} />
        <Kpi
          icon={Bell}
          label={isFr ? "Relances à faire" : "Follow-ups due"}
          value={followupsLoading ? null : followupsError ? "—" : shown.overdue}
          href="/followups"
          accent={shown.overdue > 0}
        />
      </section>

      {inBetween && <div className="mt-4"><QuickEvaluate /></div>}

      {/* ── Prochaines étapes, calculées selon la situation ── */}
      {nextSteps.length > 0 && (
        <section className="panel mt-4 p-5">
          <p className="eyebrow flex items-center gap-1.5">
            <ListTodo className="size-3.5" /> {isFr ? "Prochaines étapes" : "Next steps"}
          </p>
          <ol className="stagger mt-3 grid gap-2 md:grid-cols-2">
            {nextSteps.map((step, i) => (
              <li key={step.key}>
                <Link
                  href={step.href}
                  className="group flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3 transition hover:border-brand/40 hover:bg-surface-hover"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-soft font-mono text-[12px] font-semibold text-brand-text">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-foreground">{step.title}</span>
                    <span className="block text-[12px] text-muted">{step.detail}</span>
                  </span>
                  <ArrowRight className="nudge-x mt-1 size-4 shrink-0 text-faint group-hover:text-brand" />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {dataError && !dataLoading && (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface/40 px-5 py-4 text-sm text-muted">
          <p>{isFr ? `Impossible de charger ${fr(missingSources)}.` : `${missingSources} could not be loaded.`}</p>
          <button type="button" onClick={refetch} className="font-medium text-brand hover:underline">
            {isFr ? "Réessayer" : "Retry updates"}
          </button>
        </div>
      )}

      {/* A. Follow-ups due (demand loop) */}
      {followupsLoading ? (
        <FollowupsDueSectionSkeleton />
      ) : followupsError ? (
        null
      ) : followups.length > 0 ? (
        <Section icon={Bell} title={isFr ? "Relances à faire" : "Follow-ups due"} hint={isFr ? "Maintenez le contact — une relance proactive fait la différence" : "Keep your applications alive — a nudge beats silence"}>
          <div className="grid gap-2.5">
            {followups.map((f) => (
              <FollowUpCard key={`${f.num}-${f.company}`} followup={f} onLogged={refetch} />
            ))}
          </div>
        </Section>
      ) : null}

      {!followupsLoading && !followupsError && upcoming.length > 0 && (
        <Section icon={Bell} title={isFr ? "Relances à venir" : "Upcoming"} hint={isFr ? "Pas encore dues" : "Not due yet"}>
          <ul className="grid gap-2">
            {upcoming.map((item) => (
              <li key={`${item.num ?? item.company}-${item.nextFollowupDate ?? ""}`}>
                <Link
                  href={item.num != null ? `/pipeline/${item.num}` : "/followups"}
                  className="text-sm text-muted hover:text-brand"
                >
                  <span className="font-medium text-foreground">{item.company}</span>
                  {item.role ? <span> · {item.role}</span> : null}
                  {item.nextFollowupDate ? <span className="text-faint"> · {item.nextFollowupDate}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* B. Awaiting your decision */}
      {awaiting.length > 0 && (
        <Section icon={CircleHelp} title={isFr ? "En attente de votre décision" : "Awaiting your decision"} hint={isFr ? "Meilleur score en premier" : "Best score first"}>
          {recommended.length > 0 && (
            <Link
              href={`/pipeline/${recommended[0].n}`}
              className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition hover:bg-brand-200 max-sm:min-h-[44px]"
            >
              {isFr ? "Postuler en priorité" : "Apply next"} · {companyPresentation(recommended[0]).label} {recommended[0].score} <ArrowRight className="size-4" />
            </Link>
          )}
          {awaitingGroups.map(([label, group]) => (
            <div key={label} className="mb-3">
              <h3 className="mb-2 text-xs font-medium text-faint">{fr(label)}</h3>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {group.map((a) => (
                  <DecisionCard key={a.n} app={a} reason={reasons[a.n]} />
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* C. Fresh matches this week (supply loop) */}
      {!freshError && fresh.length > 0 && (
        <Section icon={Sparkles} title={isFr ? "Nouvelles offres de la semaine" : "Fresh matches this week"} hint={isFr ? "Détectées par vos scans locaux · 0 token" : "Found by your free scans · 0 tokens"}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {fresh.slice(0, 6).map((o) => (
              <DiscoveryCard key={o.url} offer={o} inPipeline={inboxUrls.has(o.url)} />
            ))}
          </div>
          {fresh.length > 6 && (
            <Link href="/explore?view=fresh" className="mt-3 inline-flex items-center text-sm text-muted transition hover:text-brand max-sm:min-h-[44px]">
              {isFr ? `Voir les ${freshCount} offres →` : `See all ${freshCount} →`}
            </Link>
          )}
        </Section>
      )}

    </div>
  );
}

function Section({ icon: Icon, title, hint, children }: { icon: React.ComponentType<{ className?: string }>; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <Icon className="size-4 translate-y-0.5 text-brand" />
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        <span className="text-xs text-faint">{hint}</span>
      </div>
      {children}
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  href,
  hint,
  accent = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string | null;
  href: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Link href={href} className="panel lift group flex flex-col gap-1 p-4 hover:border-brand/40">
      <span className="flex items-center justify-between text-[12px] font-medium text-muted">
        {label}
        <Icon className={`size-4 ${accent ? "text-brand" : "text-faint"}`} />
      </span>
      <span className={`font-mono text-[28px] font-semibold leading-none tracking-tight ${accent ? "text-brand-text" : "text-foreground"}`}>
        {value === null ? (
          <span className="inline-block h-7 w-10 animate-pulse rounded bg-surface-hover align-middle" />
        ) : typeof value === "number" ? (
          <CountUp value={value} />
        ) : (
          value
        )}
      </span>
      <span className="text-[11px] text-faint">{hint || "\u00a0"}</span>
    </Link>
  );
}
