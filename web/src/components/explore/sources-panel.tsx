"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, KeyRound, Minus, Plug } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SourceReport } from "@/lib/explore";

/** Ce que l'utilisateur gagne à connecter chaque source gratuite. */
const CONNECT_PITCH: Record<string, string> = {
  "france-travail": "accès suspendu côté France Travail ; relaie les offres de HelloWork, Indeed, Meteojob et des agences d'intérim",
  jooble: "les sites carrières des PME et cabinets de recrutement",
  adzuna: "des dizaines de job boards et sites d'intérim",
  careerjet: "des milliers de sites d'emploi agrégés",
};

const ORDER = ["france-travail", "meteojob", "portails", "interim", "service-public", "wttj", "adzuna", "jooble", "careerjet"];

/**
 * Bilan des sources après une recherche : d'où viennent les offres, quelles
 * sources n'ont rien donné, et lesquelles restent à connecter (gratuitement)
 * pour en obtenir davantage. Rien n'est caché derrière un total unique.
 */
export function SourcesPanel({ reports }: { reports: SourceReport[] }) {
  const [open, setOpen] = useState(false);
  if (reports.length === 0) return null;

  const sorted = [...reports].sort((a, b) => {
    const ia = ORDER.indexOf(a.id);
    const ib = ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const missing = sorted.filter((r) => r.status === "needs-key");
  const failed = sorted.filter((r) => r.status === "error");
  const answered = sorted.filter((r) => r.status === "ok" || r.status === "empty");
  const ftMissing = missing.some((r) => r.id === "france-travail");

  return (
    <section aria-label="Sources interrogées" className="space-y-3">
      {ftMissing && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/30 px-4 py-3">
          <Plug className="size-4 shrink-0 text-muted" />
          <p className="min-w-0 flex-1 basis-64 text-[13px] leading-relaxed text-muted">
            <span className="font-medium text-foreground">France Travail</span> : l&apos;accès à son API est suspendu pour le moment. Les offres
            HelloWork, Indeed et agences d&apos;intérim qu&apos;il relayait seront récupérées dès sa réouverture, si vous avez des identifiants.
          </p>
          <Link href="/portals?connect=france-travail" className="text-[13px] font-medium text-brand hover:underline max-sm:min-h-11 max-sm:leading-[2.75rem]">
            Saisir mes identifiants
          </Link>
        </div>
      )}

      <div className="rounded-xl border border-border bg-surface/30">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left text-[13px] max-sm:min-h-11"
        >
          <span className="font-medium text-foreground">
            {answered.length} source{answered.length > 1 ? "s" : ""} interrogée{answered.length > 1 ? "s" : ""}
          </span>
          {missing.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11.5px] font-medium text-amber-700 dark:text-amber-300">
              <KeyRound className="size-3" /> {missing.length} à connecter
            </span>
          )}
          {failed.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[11.5px] font-medium text-rose-700 dark:text-rose-300">
              <AlertTriangle className="size-3" /> {failed.length} en erreur
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-muted">
            {open ? "Masquer le détail" : "Voir le détail"}
            <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
          </span>
        </button>

        {open && (
          <ul className="grid gap-px border-t border-border bg-border sm:grid-cols-2">
            {sorted.map((r) => (
              <li key={r.id} className="flex items-center gap-3 bg-background px-4 py-2.5 sm:last:odd:col-span-2">
                <StatusIcon status={r.status} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">{r.label}</p>
                  <p className="text-[12px] leading-snug text-muted">{describe(r)}</p>
                </div>
                {r.status === "needs-key" ? (
                  <Link
                    href={`/portals?connect=${encodeURIComponent(r.id)}`}
                    className="shrink-0 rounded-md border border-brand/30 px-2.5 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand-soft"
                  >
                    Connecter
                  </Link>
                ) : (
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{r.kept}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function describe(r: SourceReport): string {
  if (r.status === "needs-key") return `Gratuit · ${CONNECT_PITCH[r.id] ?? "source supplémentaire"}`;
  if (r.status === "error") return "N'a pas répondu cette fois-ci";
  if (r.status === "empty") return "Aucune offre pour ce profil dans la zone";
  const dupes = r.found - r.kept;
  return dupes > 0 ? `${r.found} trouvée${r.found > 1 ? "s" : ""}, dont ${dupes} déjà vue${dupes > 1 ? "s" : ""} ailleurs` : `offre${r.kept > 1 ? "s" : ""} pour ce profil`;
}

function StatusIcon({ status }: { status: SourceReport["status"] }) {
  if (status === "ok") return <Check className="size-4 shrink-0 text-emerald-500" aria-label="A répondu" />;
  if (status === "needs-key") return <KeyRound className="size-4 shrink-0 text-amber-500" aria-label="À connecter" />;
  if (status === "error") return <AlertTriangle className="size-4 shrink-0 text-rose-500" aria-label="En erreur" />;
  return <Minus className="size-4 shrink-0 text-faint" aria-label="Aucune offre" />;
}
