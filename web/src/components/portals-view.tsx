"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Radar,
  Wrench,
  Globe,
  Building2,
  Cpu,
  CheckCircle2,
  ExternalLink,
  Key,
  Layers,
  Sparkles,
} from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { useJobs, type Job } from "@/components/jobs/job-store";
import { cn } from "@/lib/cn";
import type { WatchedCompany } from "@/lib/portals-config.mjs";
import { ApiConfigModal } from "./api-config-modal";

export type ApiInfo = {
  id: string;
  name: string;
  description: string;
  category: "Gouvernement & Open Data" | "Agrégateurs & PME" | "Réseaux ATS";
  status: "live" | "configured" | "unconfigured" | "broken";
  detail: string;
  free: boolean;
  docUrl?: string;
  envKeys?: string[];
};

type Company = { name: string; status: string; detail: string };
type Result = { available: boolean; configured: boolean; companies: Company[]; apis?: ApiInfo[]; error?: string };

const TONE: Record<string, { dot: string; label: string; chip: string }> = {
  live: { dot: "bg-emerald-500", label: "actif en direct", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  configured: { dot: "bg-blue-500", label: "connecté", chip: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  empty: { dot: "bg-amber-500", label: "actif · vide", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  broken: { dot: "bg-red-500", label: "inaccessible", chip: "bg-red-500/15 text-red-700 dark:text-red-400" },
  skipped: { dot: "bg-sky-500", label: "veille active", chip: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  unconfigured: { dot: "bg-zinc-400 dark:bg-zinc-600", label: "optionnel", chip: "bg-surface-hover text-muted" },
};

const ORDER: Record<string, number> = { broken: 0, empty: 1, live: 2, configured: 3, skipped: 4, unconfigured: 5 };

export function PortalsView({
  watched,
  initialApis = [],
  initialError,
}: {
  watched: WatchedCompany[];
  initialApis?: ApiInfo[];
  initialError?: string | null;
}) {
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
    fetch("/api/portals/verify", { cache: "no-store" })
      .then((r) => r.json())
      .then(setRes)
      .catch(() => setRes({ available: false, configured: false, companies: [] }))
      .finally(() => setLoading(false));
  }

  const apis = res?.apis ?? initialApis;
  const companies = res?.companies ?? [];
  const broken = companies.filter((c) => c.status === "broken");
  const liveN = companies.filter((c) => c.status === "live" || c.status === "empty").length;
  const sorted = [...companies].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));

  return (
    <div className="space-y-8">
      {/* En-tête */}
      <div>
        <div className="flex items-center gap-3">
          <Radar className="size-6 text-brand" />
          <h1 className="font-display text-2xl tracking-tight text-landing">
            Portails & Moteurs de Recherche d&apos;Emploi
          </h1>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          L&apos;ensemble des sources surveillées en direct pour détecter les offres sur votre secteur :
          API d&apos;État & Open Data, agrégateurs pour PME, réseaux d&apos;ATS publics et employeurs locaux du Pas-de-Calais.
        </p>
        <p className="mt-1.5 text-xs text-faint">
          Sources configurées dans <code className="text-muted">portals.yml</code> et <code className="text-muted">.env</code>.
        </p>
        {initialError && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">
            Impossible de lire <code>portals.yml</code> : {initialError}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={check}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200 disabled:opacity-50 max-sm:min-h-11"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
            Vérifier la santé des portails & API
          </button>
          {loading && (
            <span className="text-xs text-faint">
              Vérification en direct de chaque portail et API… (~2–4s)
            </span>
          )}
        </div>
      </div>

      {/* SECTION 1 : API & FLUX D'EMPLOI */}
      {apis.length > 0 && <ApisSection apis={apis} onRefresh={check} />}

      {/* SECTION 2 : EMPLOYEURS DU PAS-DE-CALAIS */}
      <div>
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Building2 className="size-4 text-brand" />
              Employeurs & Collectivités suivis (Pas-de-Calais)
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Mairies, hôpitaux, intercommunalités, ESN d&apos;infogérance et sites industriels locaux
            </p>
          </div>
          {res && (
            <span className="text-xs font-mono text-muted">
              {companies.length} sites vérifiés
            </span>
          )}
        </div>

        {!res && watched.length > 0 && <WatchedList watched={watched} />}

        {res && !res.available && !res.error && (
          <p className="mt-4 rounded-xl border border-dashed border-border bg-surface/30 p-4 text-sm text-muted">
            <code className="text-foreground">verify-portals.mjs</code> introuvable — nécessite l&apos;installation complète de Jobiify.
          </p>
        )}
        {res && !res.available && res.error && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-muted">
            <span className="font-medium text-red-700 dark:text-red-400">
              La vérification n&apos;a pas pu aboutir
            </span>{" "}
            — aucun portail n&apos;a pu être vérifié. Réessayez ou lancez{" "}
            <code className="text-foreground">node verify-portals.mjs</code>.{" "}
            <code className="break-all font-mono text-xs text-faint">{res.error}</code>
          </p>
        )}
        {res && res.available && !res.configured && (
          <p className="mt-4 rounded-xl border border-dashed border-border bg-surface/30 p-4 text-sm text-muted">
            Pas encore de <code className="text-foreground">portals.yml</code> — demandez à l&apos;assistant de configurer les entreprises à surveiller.
          </p>
        )}

        {res && res.configured && (
          <div className="mt-4">
            <p className="text-sm text-muted mb-3">
              <span className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">{liveN}</span> actifs (en ligne) ·{" "}
              <span className="tabular-nums font-semibold text-red-600 dark:text-red-400">{broken.length}</span> inaccessibles ·{" "}
              <span className="tabular-nums font-semibold">{companies.length}</span> suivis
            </p>

            {broken.length === 0 && companies.length > 0 && (
              <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    Tous les portails répondent parfaitement
                  </span>{" "}
                  <span className="text-muted">
                    — les {companies.length} sites officiels locaux sont en ligne, vérifiés et prêts pour la détection.
                  </span>
                </div>
              </div>
            )}

            {broken.length > 0 && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
                <span className="font-medium text-red-700 dark:text-red-400">
                  {broken.length} entreprise{broken.length > 1 ? "s disparaissent" : " disparaît"} silencieusement des scans
                </span>{" "}
                <span className="text-muted">
                  — leur lien carrières est inaccessible. Corrigez le careers_url dans portals.yml ou demandez à l&apos;assistant.
                </span>
              </div>
            )}

            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
              {sorted.map((c) => {
                const t = TONE[c.status] ?? TONE.skipped;
                return (
                  <li key={c.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover/50 transition-colors">
                    <CompanyLogo name={c.name} size={20} />
                    <span className={cn("size-1.5 shrink-0 rounded-full", t.dot)} />
                    <span className="shrink-0 text-sm font-medium">{c.name}</span>
                    <span className="truncate font-mono text-xs text-faint">{c.detail}</span>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      {c.status === "broken" && (
                        <FixAffordance
                          company={c.name}
                          job={fixByCompany.get(c.name)}
                          onFix={() =>
                            startJob({
                              title: `Fix · ${c.name}`,
                              subtitle: "repair portal slug",
                              kind: "fix-portal",
                              input: c.name,
                              page: "/portals",
                            })
                          }
                        />
                      )}
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", t.chip)}>{t.label}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ApisSection({ apis, onRefresh }: { apis: ApiInfo[]; onRefresh: () => void }) {
  const [configuringApi, setConfiguringApi] = useState<ApiInfo | null>(null);
  const activeCount = apis.filter((a) => a.status === "live" || a.status === "configured").length;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Cpu className="size-4 text-brand" />
            API & Moteurs d&apos;Emploi connectés
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Flux gouvernementaux, détection des PME locales (marché caché) et agrégateurs
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {activeCount} / {apis.length} actives
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {apis.map((api) => {
          const t = TONE[api.status] ?? TONE.unconfigured;
          const hasConfigAction = Boolean(api.envKeys || api.id === "la-bonne-boite");

          return (
            <div
              key={api.id}
              className="relative flex flex-col justify-between rounded-xl border border-border bg-surface/40 p-4 transition-all hover:border-brand/30 hover:bg-surface/60"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", t.dot)} />
                    <h3 className="text-sm font-semibold text-foreground leading-tight">{api.name}</h3>
                  </div>
                  <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", t.chip)}>
                    {t.label}
                  </span>
                </div>

                <p className="mt-1.5 text-xs text-muted line-clamp-2">{api.description}</p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-mono text-[11px] text-faint">{api.detail}</span>

                <div className="flex items-center gap-1.5 shrink-0">
                  {hasConfigAction && (
                    <button
                      type="button"
                      onClick={() => setConfiguringApi(api)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                        api.status === "configured"
                          ? "border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20"
                          : "border border-brand/40 bg-brand-soft text-brand hover:bg-brand hover:text-brand-foreground"
                      )}
                    >
                      <Key className="size-3" />
                      <span>{api.status === "configured" ? "Modifier" : "Configurer"}</span>
                    </button>
                  )}

                  {api.docUrl && (
                    <a
                      href={api.docUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline p-1"
                      title="Documentation officielle"
                    >
                      <span>Lien</span>
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {configuringApi && (
        <ApiConfigModal
          api={configuringApi}
          onClose={() => setConfiguringApi(null)}
          onSuccess={() => {
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function FixAffordance({ company, job, onFix }: { company: string; job?: Job; onFix: () => void }) {
  if (job?.status === "running")
    return (
      <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand">
        <Loader2 className="size-3 animate-spin" /> Réparation…
      </Link>
    );
  if (job?.status === "done")
    return (
      <Link href={`/jobs/${job.id}`} className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
        réparé · re-vérifier
      </Link>
    );
  return (
    <button
      onClick={onFix}
      title={`Demander à l'agent de réparer le portail de ${company}`}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:border-brand/40 hover:text-brand"
    >
      <Wrench className="size-3" /> Réparer
    </button>
  );
}

function WatchedList({ watched }: { watched: WatchedCompany[] }) {
  const scanned = watched.filter((c) => c.enabled).length;
  return (
    <div className="mt-4">
      <p className="text-sm text-muted mb-3">
        <span className="tabular-nums text-foreground">{scanned}</span> scannées ·{" "}
        <span className="tabular-nums">{watched.length - scanned}</span> en pause ·{" "}
        lancez une vérification pour voir quels portails répondent
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
        {watched.map((c, i) => (
          <li key={`${i}-${c.name}`} className={cn("flex items-center gap-3 px-4 py-2.5", !c.enabled && "opacity-60")}>
            <CompanyLogo name={c.name} size={20} />
            <span className="shrink-0 text-sm font-medium">{c.name}</span>
            <span className="truncate font-mono text-xs text-faint">{c.host}</span>
            {!c.enabled && (
              <span className="ml-auto shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                en pause
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
