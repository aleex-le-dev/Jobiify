"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { PROFILE_CADENCE_KEYS, type ProfileCadenceKey } from "@/lib/followups";
import { cn } from "@/lib/cn";
import { useI18n } from "@/components/i18n-provider";

// Follow-up cadence knobs → config/profile.yml (followup_cadence). Server-
// persisted (unlike the localStorage engine prefs above) because the core
// followup-cadence.mjs reads the same keys — the CLI and the web must agree.

const FIELDS: {
  key: ProfileCadenceKey;
  label: string;
  labelFr: string;
  hint: string;
  hintFr: string;
}[] = [
  {
    key: "applied_first_days",
    label: "First follow-up",
    labelFr: "Première relance",
    hint: "days after applying before the 1st nudge is due",
    hintFr: "jours après candidature avant le 1er rappel",
  },
  {
    key: "applied_subsequent_days",
    label: "Between follow-ups",
    labelFr: "Entre deux relances",
    hint: "days between nudges while Applied",
    hintFr: "jours entre chaque rappel pour le statut Candidaté",
  },
  {
    key: "applied_max_followups",
    label: "Max follow-ups",
    labelFr: "Nombre max de relances",
    hint: "after this many with no reply the lead goes cold",
    hintFr: "au-delà sans réponse, l'opportunité passe en sans nouvelles",
  },
  {
    key: "responded_initial_days",
    label: "Reply window",
    labelFr: "Délai de réponse",
    hint: "answer a company response within this many days",
    hintFr: "répondre à un message de l'entreprise sous ce nombre de jours",
  },
  {
    key: "responded_subsequent_days",
    label: "Responded / assessment cadence",
    labelFr: "Cadence en cours d'échange / test",
    hint: "days between touches while in Responded or Assessment",
    hintFr: "jours entre chaque contact en statut Répondu ou Test technique",
  },
  {
    key: "interview_thankyou_days",
    label: "Thank-you note",
    labelFr: "Remerciement post-entretien",
    hint: "due within this many days of reaching Interview",
    hintFr: "à envoyer dans ce nombre de jours après passage en Entretien",
  },
];

export function CadenceSettings() {
  const router = useRouter();
  const { locale } = useI18n();
  const isFr = locale === "fr";

  const [values, setValues] = useState<Record<ProfileCadenceKey, string> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [toggling, setToggling] = useState(false);

  // On a failed load, do NOT fall back to defaults: the user would see 7/7/2/…
  // with no warning and a Save would overwrite their real profile.yml
  // overrides. Show an error + Retry instead.
  const load = useCallback(() => {
    setLoadError(false);
    fetch("/api/followups/cadence")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        // `effective` is already defaults+overrides, computed server-side from
        // the CORE's cadenceDefaults (#2369) — no local defaults table to merge
        // in. A key the core didn't supply renders empty rather than as an
        // invented number.
        setEnabled(d?.enabled !== false);
        const eff = (d?.effective ?? {}) as Partial<Record<ProfileCadenceKey, number>>;
        setValues(
          Object.fromEntries(
            PROFILE_CADENCE_KEYS.map((k) => [k, eff[k] === undefined ? "" : String(eff[k])]),
          ) as Record<ProfileCadenceKey, string>,
        );
      })
      .catch(() => setLoadError(true));
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!values) return;
    const payload: Partial<Record<ProfileCadenceKey, number>> = {};
    for (const k of PROFILE_CADENCE_KEYS) {
      // Number(), not parseInt(): "3.5" and "7abc" must be rejected, not truncated.
      const raw = values[k].trim();
      const n = raw === "" ? Number.NaN : Number(raw);
      if (!Number.isInteger(n) || n < 0) {
        const field = FIELDS.find((f) => f.key === k);
        const name = isFr ? field?.labelFr : field?.label;
        setError(isFr ? `"${name}" doit être un nombre entier ≥ 0.` : `"${name}" must be a whole number ≥ 0.`);
        return;
      }
      payload[k] = n;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/followups/cadence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : isFr ? "Impossible d'enregistrer." : "Could not save.");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError(isFr ? "Impossible d'enregistrer." : "Could not save.");
    }
    setSaving(false);
  };

  const toggle = async (next: boolean) => {
    setToggling(true);
    setError(null);
    try {
      const res = await fetch("/api/followups/cadence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : isFr ? "Impossible d'enregistrer." : "Could not save.");
      } else {
        setEnabled(next);
        // The nav is rendered on the server from the same setting. A router
        // refresh re-renders it without unloading running jobs.
        router.refresh();
      }
    } catch {
      setError(isFr ? "Impossible d'enregistrer." : "Could not save.");
    }
    setToggling(false);
  };

  return (
    <div>
      <label className="mt-8 mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
        {isFr ? "Cadence des relances" : "Follow-up cadence"}
      </label>
      <div className="rounded-xl border border-border bg-surface/50 p-4">
        <p className="text-xs leading-relaxed text-faint">
          {isFr ? (
            <>
              Quand le suivi des <span className="text-muted">Relances</span> vous avertit. Enregistré dans{" "}
              <span className="font-mono text-muted">config/profile.yml</span> — le CLI utilise les mêmes valeurs.
            </>
          ) : (
            <>
              When the <span className="text-muted">Follow-ups</span> tracker nudges you. Saved to{" "}
              <span className="font-mono text-muted">config/profile.yml</span> — the CLI uses the same values.
            </>
          )}
        </p>
        {loadError ? (
          <div className="mt-3 text-sm text-muted">
            <p className="text-red-500">
              {isFr ? (
                <>
                  Impossible de lire vos paramètres de cadence actuels — les valeurs par défaut ne sont pas affichées, pour éviter d&apos;écraser des valeurs réelles dans{" "}
                  <span className="font-mono">config/profile.yml</span>.
                </>
              ) : (
                <>
                  Couldn&apos;t read your current cadence settings — not showing defaults, to avoid overwriting real values in{" "}
                  <span className="font-mono">config/profile.yml</span>.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-hover"
            >
              {isFr ? "Réessayer" : "Retry"}
            </button>
          </div>
        ) : values === null ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> {isFr ? "Chargement…" : "Loading…"}
          </div>
        ) : (
          <>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={enabled}
                disabled={toggling}
                onChange={(e) => toggle(e.target.checked)}
                className="size-4 accent-brand"
              />
              {isFr ? "Activer le suivi des relances" : "Track follow-ups"}
              {toggling && <Loader2 className="size-3.5 animate-spin" />}
            </label>
            <p className="mt-0.5 text-xs text-faint">
              {isFr ? (
                <>
                  Désactivé, cela masque la page Relances et cesse de programmer des dates de relance. Enregistré sous{" "}
                  <span className="font-mono text-muted">follow_ups.enabled</span>.
                </>
              ) : (
                <>
                  Off hides the Follow-ups page and stops scheduling follow-up dates. Saved as{" "}
                  <span className="font-mono text-muted">follow_ups.enabled</span>.
                </>
              )}
            </p>
            {enabled && (
              <>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <label key={f.key} className="block">
                      <span className="block text-sm font-medium text-foreground">
                        {isFr ? f.labelFr : f.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-faint">
                        {isFr ? f.hintFr : f.hint}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={values[f.key]}
                        onChange={(e) => setValues((v) => (v ? { ...v, [f.key]: e.target.value } : v))}
                        className="mt-1.5 w-24 rounded-md border border-border bg-surface/60 px-3 py-1.5 text-sm tabular-nums outline-none transition-colors focus:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/40"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className={cn(
                    "mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:bg-surface-hover",
                    "disabled:pointer-events-none disabled:opacity-60",
                  )}
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5 text-emerald-400" /> : null}
                  {saved ? (isFr ? "Enregistré" : "Saved") : (isFr ? "Enregistrer la cadence" : "Save cadence")}
                </button>
              </>
            )}
            {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
