"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Radar, Wrench } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { useJobs, type Job } from "@/components/jobs/job-store";
import { cn } from "@/lib/cn";
import type { WatchedCompany } from "@/lib/portals-config.mjs";
import { useI18n } from "@/components/i18n-provider";

type Company = { name: string; status: string; detail: string };
type Result = { available: boolean; configured: boolean; companies: Company[]; error?: string };

const TONE_EN: Record<string, { dot: string; label: string; chip: string }> = {
  live: { dot: "bg-emerald-500", label: "live", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  empty: { dot: "bg-amber-500", label: "live · empty", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  broken: { dot: "bg-red-500", label: "broken", chip: "bg-red-500/15 text-red-700 dark:text-red-400" },
  skipped: { dot: "bg-zinc-400", label: "no ATS", chip: "bg-surface-hover text-muted" },
};

const TONE_FR: Record<string, { dot: string; label: string; chip: string }> = {
  live: { dot: "bg-emerald-500", label: "actif", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  empty: { dot: "bg-amber-500", label: "actif · vide", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  broken: { dot: "bg-red-500", label: "inaccessible", chip: "bg-red-500/15 text-red-700 dark:text-red-400" },
  skipped: { dot: "bg-zinc-400", label: "sans ATS", chip: "bg-surface-hover text-muted" },
};

const ORDER: Record<string, number> = { broken: 0, empty: 1, live: 2, skipped: 3 };

export function PortalsView({ watched, initialError }: { watched: WatchedCompany[]; initialError?: string | null }) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const toneMap = isFr ? TONE_FR : TONE_EN;
  const [res, setRes] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const { jobs, startJob } = useJobs();

  // map the agentic "fix-portal" workers to the company they're repairing
  const fixByCompany = useMemo(() => {
    const m = new Map<string, (typeof jobs)[number]>();
    for (const j of jobs) {
      if (j.kind !== "fix-portal" || !j.input) continue;
      const ex = m.get(j.input);
      if (!ex || j.startedAt > ex.startedAt) m.set(j.input, j);
    }
    return m;
  }, [jobs]);

  function check() {
    setLoading(true);
    fetch("/api/portals/verify")
      .then((r) => r.json())
      .then(setRes)
      .catch(() => setRes({ available: false, configured: false, companies: [] }))
      .finally(() => setLoading(false));
  }

  const companies = res?.companies ?? [];
  const broken = companies.filter((c) => c.status === "broken");
  const liveN = companies.filter((c) => c.status === "live" || c.status === "empty").length;
  const sorted = [...companies].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

  return (
    <div>
      <div className="flex items-center gap-3">
        <Radar className="size-6 text-brand" />
        <h1 className="font-display text-2xl tracking-tight text-landing">
          {isFr ? "Portails" : "Portals"}
        </h1>
      </div>
      <p className="mt-1.5 max-w-xl text-sm text-muted">
        {isFr
          ? "Les entreprises suivies par Jobiify pour détecter de nouvelles opportunités. Lancez une vérification pour repérer les sites carrières inaccessibles — un lien rompu signifie que l'entreprise sera ignorée lors des prochains scans."
          : "The companies Jobiify watches for new roles. Run a health check to catch company boards that have quietly broken — a broken link means that company silently disappears from every future scan."}
      </p>
      <p className="mt-1.5 text-xs text-faint">
        {isFr ? (
          <>
            Basé sur <code className="text-muted">portals.yml</code> — modifiez-le directement ou demandez à l&apos;assistant.
          </>
        ) : (
          <>
            Backed by <code className="text-muted">portals.yml</code> — edit it directly or ask the assistant.
          </>
        )}
      </p>
      {initialError && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">
          {isFr ? "Impossible de lire" : "Could not read"} <code>portals.yml</code>: {initialError}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={check}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200 disabled:opacity-50 max-sm:min-h-[44px]"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
          {isFr ? "Vérifier la santé des portails" : "Check portal health"}
        </button>
        {loading && (
          <span className="text-xs text-faint">
            {isFr ? "Test des ATS de chaque entreprise… (~30–60s)" : "Probing each company's ATS… (~30–60s)"}
          </span>
        )}
      </div>

      {!res && watched.length > 0 && <WatchedList watched={watched} isFr={isFr} />}

      {res && !res.available && !res.error && (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-surface/30 p-4 text-sm text-muted">
          <code className="text-foreground">verify-portals.mjs</code> {isFr ? "introuvable — nécessite l'installation complète de Jobiify." : "not found — this needs a complete Jobiify checkout (the web orchestrates the core's validator)."}
        </p>
      )}
      {res && !res.available && res.error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-muted">
          <span className="font-medium text-red-700 dark:text-red-400">
            {isFr ? "La vérification n'a pas pu aboutir" : "The portal check did not finish"}
          </span>{" "}
          — {isFr ? "aucun portail n'a pu être vérifié. Réessayez ou lancez" : "no portal was verified, so none is shown as healthy. Try again, or run"}{" "}
          <code className="text-foreground">node verify-portals.mjs</code>.{" "}
          <code className="break-all font-mono text-xs text-faint">{res.error}</code>
        </p>
      )}
      {res && res.available && !res.configured && (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-surface/30 p-4 text-sm text-muted">
          {isFr ? "Pas encore de" : "No"} <code className="text-foreground">portals.yml</code> — {isFr ? "demandez à l'assistant de configurer les entreprises à surveiller." : "ask the assistant to set up the companies to scan."}
        </p>
      )}

      {res && res.configured && (
        <div className="mt-5">
          <p className="text-sm text-muted">
            <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{liveN}</span> {isFr ? "actifs" : "live"} ·{" "}
            <span className="tabular-nums text-red-600 dark:text-red-400">{broken.length}</span> {isFr ? "inaccessibles" : "broken"} ·{" "}
            <span className="tabular-nums">{companies.length}</span> {isFr ? "suivis" : "tracked"}
          </p>
          {broken.length > 0 && (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
              <span className="font-medium text-red-700 dark:text-red-400">
                {isFr
                  ? `${broken.length} entreprise${broken.length > 1 ? "s disparaissent" : " disparaît"} silencieusement des scans`
                  : `${broken.length} ${broken.length === 1 ? "company silently drops" : "companies silently drop"} from every scan`}
              </span>{" "}
              <span className="text-muted">
                {isFr
                  ? "— leur lien carrières est inaccessible. Corrigez le careers_url dans portals.yml ou demandez à l'assistant."
                  : "— their careers link is broken. Fix the careers_url in portals.yml (or ask the assistant to repair them)."}
              </span>
            </div>
          )}
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
            {sorted.map((c) => {
              const t = toneMap[c.status] ?? toneMap.skipped;
              return (
                <li key={c.name} className="flex items-center gap-3 px-4 py-2.5">
                  <CompanyLogo name={c.name} size={20} />
                  <span className={cn("size-1.5 shrink-0 rounded-full", t.dot)} />
                  <span className="shrink-0 text-sm font-medium">{c.name}</span>
                  <span className="truncate font-mono text-xs text-faint">{c.detail}</span>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    {c.status === "broken" && <FixAffordance company={c.name} job={fixByCompany.get(c.name)} isFr={isFr} onFix={() => startJob({ title: `Fix · ${c.name}`, subtitle: "repair portal slug", kind: "fix-portal", input: c.name, page: "/portals" })} />}
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", t.chip)}>{t.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function FixAffordance({ company, job, isFr, onFix }: { company: string; job?: Job; isFr?: boolean; onFix: () => void }) {
  if (job?.status === "running")
    return (
      <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand">
        <Loader2 className="size-3 animate-spin" /> {isFr ? "Réparation…" : "Fixing…"}
      </Link>
    );
  if (job?.status === "done")
    return (
      <Link href={`/jobs/${job.id}`} className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
        {isFr ? "réparé · re-vérifier" : "repaired · re-check"}
      </Link>
    );
  return (
    <button
      onClick={onFix}
      title={isFr ? `Demander à l'agent de réparer le portail de ${company}` : `Have the agent repair ${company}'s portal slug`}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-brand/40 hover:text-brand"
    >
      <Wrench className="size-3" /> {isFr ? "Réparer" : "Fix"}
    </button>
  );
}

function WatchedList({ watched, isFr }: { watched: WatchedCompany[]; isFr?: boolean }) {
  const scanned = watched.filter((c) => c.enabled).length;
  return (
    <div className="mt-5">
      <p className="text-sm text-muted">
        <span className="tabular-nums text-foreground">{scanned}</span> {isFr ? "scannées" : "scanned"} ·{" "}
        <span className="tabular-nums">{watched.length - scanned}</span> {isFr ? "en pause" : "paused"} ·{" "}
        {isFr ? "lancez une vérification pour voir quels portails répondent" : "run a health check to see which boards still answer"}
      </p>
      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
        {watched.map((c, i) => (
          <li key={`${i}-${c.name}`} className={cn("flex items-center gap-3 px-4 py-2.5", !c.enabled && "opacity-60")}>
            <CompanyLogo name={c.name} size={20} />
            <span className="shrink-0 text-sm font-medium">{c.name}</span>
            <span className="truncate font-mono text-xs text-faint">{c.host}</span>
            {!c.enabled && (
              <span className="ml-auto shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                {isFr ? "en pause" : "paused"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
