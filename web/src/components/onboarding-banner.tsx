"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X, Settings } from "lucide-react";

import { useI18n } from "./i18n-provider";

type Doctor = { available: boolean; onboardingNeeded: boolean; missing: string[]; warnings: string[] };

function hasCli(): boolean {
  try {
    return !!JSON.parse(localStorage.getItem("career-ops:config") || "{}").cliId;
  } catch {
    return false;
  }
}

const LABELS_EN: Record<string, string> = {
  "cv.md": "your CV",
  "config/profile.yml": "your profile — target roles, comp, location",
  "modes/_profile.md": "your personalization",
  "portals.yml": "the companies to scan",
};

const LABELS_FR: Record<string, string> = {
  "cv.md": "votre CV",
  "config/profile.yml": "votre profil — postes cibles, salaire, localisation",
  "modes/_profile.md": "vos critères personnalisés",
  "portals.yml": "les entreprises à scanner",
};

// Detect (via the core's doctor.mjs) whether setup is incomplete, and offer to
// finish it CONVERSATIONALLY — the assistant asks in plain language and writes
// the canonical files (no YAML to edit). This is the #1 adoption barrier.
export function OnboardingBanner() {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [d, setD] = useState<Doctor | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [cli, setCli] = useState(true); // assume until read (avoid CTA flash)

  useEffect(() => {
    setCli(hasCli());
    fetch("/api/doctor")
      .then((r) => r.json())
      .then(setD)
      .catch(() => {});
  }, []);

  if (dismissed || !d || !d.onboardingNeeded) return null;
  const labelsMap = isFr ? LABELS_FR : LABELS_EN;
  const items = d.missing.map((m) => labelsMap[m] ?? m);
  const kickoff = isFr
    ? `Aide-moi à finaliser la configuration de Jobiify. Je dois encore configurer : ${items.join(", ")}. Guide-moi en français, étape par étape, et écris les fichiers pour moi.`
    : `Help me finish setting up Jobiify. I still need to add ${items.join(", ")} — walk me through just those, conversationally, and write the files for me. Don't ask me for anything that's already set up (for example, don't ask for my CV if it's already saved).`;

  return (
    <div className="dot-bg relative mb-6 overflow-hidden rounded-2xl border border-brand/30 bg-linear-to-br from-brand/10 via-surface/40 to-transparent p-5">
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-3 text-faint transition-colors hover:text-foreground"
        aria-label={isFr ? "Fermer" : "Dismiss"}
      >
        <X className="size-4" />
      </button>
      <h2 className="font-display text-xl text-landing">
        {isFr ? "Finalisons votre configuration" : "Let's finish setting you up"}
      </h2>
      <p className="mt-1.5 max-w-xl text-sm text-muted">
        {isFr ? (
          <>
            Jobiify fonctionne au mieux lorsqu'il vous connaît. Nous avons encore besoin de {items.join(", ")}.{" "}
            <span className="text-foreground">Pas de fichier YAML à éditer manuellement</span> — répondez simplement et l&apos;assistant écrit tout pour vous.
          </>
        ) : (
          <>
            Jobiify works best when it knows you. We still need {items.join(", ")}.{" "}
            <span className="text-foreground">No YAML to edit</span> — answer in plain language and the assistant writes it
            for you.
          </>
        )}
      </p>
      {cli ? (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("co-assistant", { detail: { message: kickoff } }))}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200"
        >
          <Sparkles className="size-4" /> {isFr ? "Configurer avec l'assistant" : "Set me up with the assistant"}
        </button>
      ) : (
        <Link
          href="/config"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200"
        >
          <Settings className="size-4" /> {isFr ? "Connecter votre CLI IA pour commencer" : "Connect your AI CLI to get started"}
        </Link>
      )}
    </div>
  );
}
