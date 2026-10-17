"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Coins } from "lucide-react";
import type { DiscoveredOffer } from "@/lib/explore";
import { useI18n } from "@/components/i18n-provider";
import { parseOfferTimestamp } from "@/lib/format";
import { DiscoveryCard } from "./discovery-card";
import { useExplore } from "./explore-provider";

export type EnrichedOffer = DiscoveredOffer & { inPipeline: boolean; evaluatedN?: string };

export function ResultsList({ offers }: { offers: EnrichedOffer[] }) {
  const { isFr } = useI18n();
  const { error, addToPipeline, added, removed, mode, running, filters } = useExplore();
  const isAi = mode === "ai";
  const [q, setQ] = useState("");

  const view = useMemo(() => {
    const needle = q.trim().toLowerCase();
    // Ne conserver que les offres possédant une date de publication réelle
    let list = offers.filter((o) => typeof o.postedAt === "string" && o.postedAt.trim().length > 0);

    if (needle) {
      list = list.filter((o) => o.title.toLowerCase().includes(needle) || o.company.toLowerCase().includes(needle));
    }
    // Toujours trier par défaut du plus récent au plus ancien
    const sorted = [...list].sort((a, b) => {
      const timeA = parseOfferTimestamp(a.postedAt);
      const timeB = parseOfferTimestamp(b.postedAt);
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return a.title.localeCompare(b.title);
    });
    return sorted;
  }, [offers, q, filters?.sinceDays, isAi]);

  const addable = view.filter((o) => {
    const inSel = (added.has(o.url) || o.inPipeline) && !removed?.has(o.url);
    return !inSel && !o.evaluatedN;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-sm text-foreground">
            <span className="font-semibold">{view.length}</span>{" "}
            {isFr
              ? `offre${view.length > 1 ? "s" : ""} trouvée${view.length > 1 ? "s" : ""}`
              : `role${view.length === 1 ? "" : "s"} found`}
            {isAi && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                <Coins className="size-3" /> {isFr ? "Consomme des jetons IA" : "Uses AI tokens"}
              </span>
            )}
          </p>
          {!isAi && error && <p className="text-[12px] text-amber-700 dark:text-amber-300">{error}</p>}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/40 px-2.5 py-1.5">
            <Search className="size-3.5 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={isFr ? "Filtrer les résultats…" : "Filter results…"}
              className="w-32 bg-transparent text-[13px] outline-none placeholder:text-faint"
            />
          </div>

          {addable.length > 1 && (
            <button
              type="button"
              onClick={() => addToPipeline(addable)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/40 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-brand-soft hover:text-brand"
            >
              <Plus className="size-3.5" /> {isFr ? `Tout ajouter (${addable.length})` : `Add all ${addable.length}`}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {view.map((o) => (
          <DiscoveryCard key={o.url} offer={o} inPipeline={o.inPipeline} evaluatedN={o.evaluatedN} />
        ))}
      </div>

      {view.length === 0 && (q.trim() || !running) && (
        <p className="py-10 text-center text-sm text-faint">
          {isFr ? `Aucun résultat ne correspond à « ${q} ».` : `No results match “${q}”.`}
        </p>
      )}
    </div>
  );
}
