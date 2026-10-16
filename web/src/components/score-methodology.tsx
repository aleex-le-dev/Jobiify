"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

const DIMENSIONS_EN: [string, string][] = [
  ["Match", "how well your CV maps to the role's requirements"],
  ["North-star alignment", "how far the role moves you toward your stated career goal"],
  ["Compensation", "the offer vs market rates (says “insufficient data” when comp is missing — never invents numbers)"],
  ["Cultural signals", "team, values and ways-of-working signals from the posting"],
  ["Red flags", "ghost-job, scam or mismatch warnings"],
  ["Overall", "the single judgment that rolls the above into the score"],
];

const DIMENSIONS_FR: [string, string][] = [
  ["Correspondance", "adéquation précise entre votre CV et les exigences du poste"],
  ["Alignement objectif", "mesure dans laquelle ce rôle vous rapproche de votre objectif professionnel"],
  ["Rémunération", "l'offre comparée aux salaires du marché (mentionne “données insuffisantes” si absent — n'invente rien)"],
  ["Signaux culturels", "équipe, valeurs et modes de travail perceptibles dans l'annonce"],
  ["Alertes (Red flags)", "détection des offres fantômes, arnaques ou incohérences"],
  ["Global", "le jugement unique consolidant l'ensemble des dimensions en un score"],
];

const BLOCKS_EN: [string, string][] = [
  ["A", "Plain-English summary of the role"],
  ["B", "A table of how your CV matches each requirement, how much each requirement matters for this posting, and the gaps"],
  ["C", "Strategy — how to position yourself for this role"],
  ["D", "Compensation research, comparing the offer to market rates"],
  ["E", "Personalization notes for your application"],
  ["F", "Interview prep — STAR stories tailored to this job"],
  ["G", "Posting legitimacy — a check that the listing is real, not a scam or ghost job"],
];

const BLOCKS_FR: [string, string][] = [
  ["A", "Résumé clair et synthétique du poste"],
  ["B", "Tableau de correspondance de votre CV avec chaque critère, leur importance et les lacunes"],
  ["C", "Stratégie — comment vous positionner idéalement pour cette opportunité"],
  ["D", "Étude salariale comparant la proposition aux prix du marché"],
  ["E", "Conseils de personnalisation pour votre candidature"],
  ["F", "Préparation d'entretien — histoires STAR adaptées à cette offre"],
  ["G", "Légitimité de l'offre — vérification qu'il s'agit d'une offre réelle, ni arnaque ni offre fantôme"],
];

export function ScoreMethodology() {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const dimensions = isFr ? DIMENSIONS_FR : DIMENSIONS_EN;
  const blocks = isFr ? BLOCKS_FR : BLOCKS_EN;

  return (
    <details className="group mt-10 overflow-hidden rounded-2xl border border-border bg-surface/30">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors hover:bg-surface-hover">
        {isFr ? (
          <>
            Comment Jobiify a évalué cette offre — et pourquoi c&apos;est calculé pour <span className="text-landing">vous</span>
          </>
        ) : (
          <>
            How Jobiify scored this — and why it&apos;s for <span className="text-landing">you</span>
          </>
        )}
        <ChevronDown className="ml-auto size-4 text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-border px-5 py-4 text-sm">
        <p className="text-muted">
          {isFr ? (
            <>
              Chaque poste est noté de <strong className="text-foreground">1.0 à 5.0</strong> sur six dimensions.{" "}
              <strong className="text-brand">4.0</strong> est le seuil de candidature — en dessous, Jobiify déconseille de postuler.
            </>
          ) : (
            <>
              Every role is scored <strong className="text-foreground">1.0–5.0</strong> across six dimensions.{" "}
              <strong className="text-brand">4.0</strong> is the apply / don&apos;t-apply line — below it, Jobiify recommends against applying.
            </>
          )}
        </p>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-faint">
            {isFr ? "Les six dimensions" : "The six dimensions"}
          </div>
          <ul className="space-y-1.5">
            {dimensions.map(([k, v]) => (
              <li key={k}>
                <span className="font-medium text-foreground">{k}</span> <span className="text-muted">— {v}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-faint">
            {isFr ? "Ce que signifie chaque section du rapport" : "What each report block means"}
          </div>
          <ul className="space-y-2">
            {blocks.map(([k, v]) => (
              <li key={k} className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-brand-soft text-xs font-semibold text-brand">
                  {k}
                </span>
                <span className="text-muted">{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <a
          href="https://career-ops.org/methodology"
          target="_blank"
          rel="noreferrer"
          aria-label={isFr ? "Méthodologie complète (nouvel onglet)" : "Full methodology (opens in a new tab)"}
          className="inline-flex min-h-6 items-center gap-1 text-xs text-brand transition-colors hover:underline max-sm:min-h-11"
        >
          {isFr ? "Méthodologie complète" : "Full methodology"} <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>
    </details>
  );
}
