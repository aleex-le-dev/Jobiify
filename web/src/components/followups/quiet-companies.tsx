"use client";

import { useEffect, useState } from "react";
import { Clock3, Copy, Check } from "lucide-react";
import { quietModel, checkRan } from "@/lib/quiet-companies.mjs";
import type { QuietModel, QuietCompany } from "@/lib/quiet-companies.mjs";
import { useI18n } from "@/components/i18n-provider";

export function QuietCompanies() {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [model, setModel] = useState<QuietModel | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/quiet-companies")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => alive && setModel(quietModel(d)))
      .catch(() => alive && setModel(quietModel(null)));
    return () => {
      alive = false;
    };
  }, []);

  if (!model) {
    return <div className="mt-8 h-24 w-full animate-pulse rounded-2xl bg-muted/25" aria-hidden />;
  }

  if (!checkRan(model)) {
    return (
      <section className="mt-8 rounded-2xl border border-dashed border-border bg-surface/30 px-5 py-4">
        <Header courtesyDays={null} isFr={isFr} />
        <p className="mt-2 text-sm text-muted">
          {isFr
            ? "Cette vérification n'a pas été exécutée, impossible d'indiquer si des entreprises sont sans nouvelles."
            : "This check didn't run, so nothing here says whether anyone has gone quiet."}
        </p>
      </section>
    );
  }

  if (model.companies.length === 0) {
    return (
      <section className="mt-8 rounded-2xl border border-border bg-surface/30 px-5 py-4">
        <Header courtesyDays={model.courtesyDays} isFr={isFr} />
        <p className="mt-2 text-sm text-muted">
          {isFr
            ? `Aucune entreprise n'est restée silencieuse au-delà du seuil${model.checked > 0 ? ` parmi ${model.checked} entreprise${model.checked > 1 ? "s" : ""}` : ""}.`
            : `Nothing has gone quiet past the threshold${model.checked > 0 ? ` across ${model.checked} compan${model.checked === 1 ? "y" : "ies"}` : ""}.`}
        </p>
        <Caveats warnings={model.warnings} disclaimer={model.disclaimer} />
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface/40 px-5 py-4">
      <Header courtesyDays={model.courtesyDays} isFr={isFr} />

      <div className="mt-3 grid gap-2.5">
        {model.companies.map((c) => (
          <Row key={`${c.company}-${c.lastDate ?? ""}`} c={c} isFr={isFr} />
        ))}
      </div>

      <Caveats warnings={model.warnings} disclaimer={model.disclaimer} />
    </section>
  );
}

function Caveats({ warnings, disclaimer }: { warnings: string[]; disclaimer: string | null }) {
  return (
    <>
      {warnings.map((w, i) => (
        <p key={i} className="mt-3 text-xs text-muted">
          {w}
        </p>
      ))}
      {disclaimer && (
        <p className="mt-4 border-t border-border pt-3 text-xs text-faint">{disclaimer}</p>
      )}
    </>
  );
}

function Header({ courtesyDays, isFr }: { courtesyDays: number | null; isFr?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Clock3 className="size-4 text-brand" />
      <h2 className="font-display text-base text-landing">
        {isFr ? "Sans réponse depuis votre dernier échange" : "No reply since your last round"}
      </h2>
      {courtesyDays !== null && (
        <span className="text-xs text-faint">
          {isFr ? `plus de ${courtesyDays} jours` : `past ${courtesyDays} days`}
        </span>
      )}
    </div>
  );
}

function Row({ c, isFr }: { c: QuietCompany; isFr?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);

  const copy = async () => {
    if (!c.blacklistRow) return;
    try {
      await navigator.clipboard.writeText(c.blacklistRow);
      setCopied(true);
      setFallback(null);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setFallback(c.blacklistRow);
    }
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface/40 px-3.5 py-2.5">
      <div className="min-w-0 flex-[1_1_60%]">
        <p className="truncate text-sm">
          <span className="font-medium text-foreground">{c.company}</span>
          {c.role && <span className="text-muted"> · {c.role}</span>}
        </p>
        <p className="text-xs text-faint">
          {isFr
            ? `${c.days} jour${c.days > 1 ? "s" : ""} depuis ${c.lastDate ?? "le dernier échange"}`
            : `${c.days} day${c.days === 1 ? "" : "s"} since ${c.lastDate ?? "the last round"}`}
          {c.trackerNums.length > 0 && <span> · #{c.trackerNums.join(", #")}</span>}
        </p>
      </div>
      {c.blacklistRow && (
        <button
          type="button"
          onClick={copy}
          title={c.blacklistRow}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted transition hover:border-brand/40 hover:text-foreground"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? (isFr ? "Copié" : "Copied") : (isFr ? "Copier ligne blacklist" : "Copy blacklist row")}
        </button>
      )}
      {fallback && (
        <div className="w-full">
          <p className="text-xs text-muted">
            {isFr ? "Presse-papiers inaccessible — sélectionnez et copiez :" : "Couldn't reach the clipboard — select and copy:"}
          </p>
          <code className="mt-1 block w-full select-all overflow-x-auto rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] text-foreground">
            {fallback}
          </code>
        </div>
      )}
    </div>
  );
}
