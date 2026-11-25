"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Compass, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Bouton « Chercher un autre métier » : à placer avec les autres actions de l'en-tête. */
export function OtherSearchButton({ open, onToggle, hasProfile }: { open: boolean; onToggle: () => void; hasProfile: boolean }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls="other-search-form"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-xs transition hover:bg-surface-hover max-sm:min-h-[44px] max-sm:w-full sm:max-lg:w-full",
        open && "border-brand/40 bg-surface-hover",
      )}
    >
      <Compass className="size-4" /> {hasProfile ? "Chercher un autre métier" : "Chercher un métier"}
    </button>
  );
}

/**
 * Formulaire « autre métier » : une recherche pour un autre métier que celui du profil,
 * sans toucher au profil. Elle garde la zone de trajet et les mots exclus du profil actif.
 */
export function OtherSearchForm({ hasProfile, onClose }: { hasProfile: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const metier = q.trim();
  useEffect(() => input.current?.focus(), []);

  function go() {
    if (metier.length < 3) return;
    router.push(`/explore?metier=${encodeURIComponent(metier)}&run=1`);
  }

  return (
    <form
      id="other-search-form"
      className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <label className="sr-only" htmlFor="other-metier">Métier recherché</label>
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:border-brand/50">
        <Search className="size-4 shrink-0 text-faint" />
        <input
          id="other-metier"
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Un métier : cariste, comptable, électricien…"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </div>
      <button
        type="submit"
        disabled={metier.length < 3}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50 max-sm:min-h-[44px] max-sm:w-full max-sm:justify-center"
      >
        Chercher
      </button>
      <button type="button" aria-label="Fermer" onClick={onClose} className="rounded-md p-2 text-faint hover:text-foreground max-sm:min-h-[44px] max-sm:min-w-[44px]">
        <X className="size-4" />
      </button>
      <div className="basis-full border-t border-border pt-3">
        <Link href="/explore?all=1&run=1" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline max-sm:min-h-11 max-sm:items-center">
          Ou voir tous les métiers de ma zone <span aria-hidden="true">→</span>
        </Link>
      </div>
      <p className="basis-full text-[12.5px] leading-relaxed text-muted">
        {hasProfile
          ? "Votre profil n'est pas modifié : la recherche garde votre zone de trajet et vos mots exclus, et ajoute les intitulés voisins du métier."
          : "La recherche ajoute les intitulés voisins du métier saisi."}
      </p>
    </form>
  );
}
