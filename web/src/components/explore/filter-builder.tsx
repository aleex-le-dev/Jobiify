"use client";

import { useState } from "react";
import { X, Ban, Clock, MapPin, Trash2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { cleanChips, RECENCY_FR, RECENCY_EN, type ExploreFilters } from "@/lib/explore";
import { useI18n } from "@/components/i18n-provider";

const STYLE = `
.co-fb__chip{display:inline-flex;align-items:center;gap:.3rem;border-radius:999px;padding:.2rem .5rem .2rem .6rem;font-size:12.5px;line-height:1.2;border:1px solid transparent}
.co-fb__chip button{display:inline-flex;opacity:.6;transition:opacity .15s}
.co-fb__chip button:hover{opacity:1}
.co-fb__chip.inc{color:hsl(26 78% 42%);background:hsl(26 73% 51% / .11);border-color:hsl(26 73% 51% / .26)}
html.dark .co-fb__chip.inc{color:hsl(26 86% 70%);background:hsl(26 80% 55% / .14);border-color:hsl(26 80% 55% / .28)}
.co-fb__field{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;min-height:2.6rem;padding:.45rem .55rem;border-radius:.7rem}
.co-fb__field input{flex:1;min-width:7rem;background:transparent;border:none;outline:none;font-size:13.5px;color:inherit}
.co-fb__field input::placeholder{color:var(--co-faint,hsl(0 0% 60%))}
@media (max-width:639px){.co-fb__chip button{min-width:44px;min-height:44px;justify-content:center}.co-fb__chip{min-height:44px}.co-fb__field{min-height:44px}.co-fb__field input{min-height:32px}}
`;

function KeywordField({
  values,
  tone,
  placeholder,
  ariaLabel,
  onChange,
}: {
  values: string[];
  tone: "inc" | "exc";
  placeholder: string;
  ariaLabel?: string;
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  // Split only on UNAMBIGUOUS item separators (comma / newline / semicolon) — never
  // bare spaces, which are legitimate inside multi-word entries ("AI platform",
  // "New York", "Costa Rica"). A space-only paste stays one chip on purpose (#1147).
  const commit = (text: string) => {
    const parts = text.split(/[,\n;\t\r]+/);
    const next = cleanChips([...values, ...parts]);
    onChange(next);
    setDraft("");
  };
  return (
    <div className={cn("co-fb__field border border-border bg-surface/40 focus-within:border-brand/40 transition-colors")}>
      {values.map((v) => (
        <span key={v} className={cn("co-fb__chip", tone === "inc" ? "inc" : "border-border bg-surface-hover text-muted")}>
          {tone === "exc" && <Ban className="size-3 opacity-70" />}
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => {
          const val = e.target.value;
          if (/[,\n;\t\r]$/.test(val)) commit(val);
          else setDraft(val);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text");
          const merged = draft + text;
          // Only commit to chips when the paste contains item separators.
          // A plain-text paste (e.g. pasting "-EMEA" after typing "Remote")
          // stays in the input field so the user can keep editing.
          if (/[,;\n\t\r]/.test(text)) commit(merged);
          else setDraft(merged);
        }}
        onBlur={() => draft.trim() && commit(draft)}
        placeholder={values.length ? "" : placeholder}
      />
    </div>
  );
}

const PRESET_CATEGORIES = [
  {
    id: "web",
    labelFr: "🌐 Dév Web",
    labelEn: "🌐 Web Dev",
    roles: [
      "Développeur Web",
      "Développeur Front",
      "Développeur Frontend",
      "Frontend Developer",
      "Développeur Fullstack",
      "Développeur Full Stack",
      "Fullstack Developer",
      "Développeur PHP",
      "Développeur React",
      "Développeur JavaScript",
      "Intégrateur Web",
      "UI/UX Designer",
    ],
  },
  {
    id: "support",
    labelFr: "🖥️ Support IT & Proximité",
    labelEn: "🖥️ IT Support",
    roles: [
      "Technicien Informatique",
      "Technicien Support",
      "Technicien Helpdesk",
      "Support Informatique",
      "Technicien de Proximité",
      "Technicien de Maintenance Informatique",
      "Technicien Poste de Travail",
      "Technicien Déploiement",
      "Technicien Bureautique",
    ],
  },
  {
    id: "systems",
    labelFr: "🔌 Réseaux & Systèmes",
    labelEn: "🔌 Systems & Networks",
    roles: [
      "Technicien Réseau",
      "Technicien Systèmes et Réseaux",
      "Administrateur Système",
      "Gestionnaire de Parc Informatique",
      "Technicien Parc Informatique",
      "Technicien Télécoms",
    ],
  },
  {
    id: "erp",
    labelFr: "📦 Support ERP / Logistique",
    labelEn: "📦 ERP / Logistics Support",
    roles: [
      "Référent Informatique",
      "Référent Digital",
      "Support Applicatif",
      "Gestionnaire de Parc",
    ],
  },
  {
    id: "safetynet",
    labelFr: "🛡️ Filets larges (Tous)",
    labelEn: "🛡️ Broad Safety Net",
    roles: [
      "Développeur",
      "Developer",
      "Software",
      "Technicien",
      "Informatique",
      "Support",
      "Helpdesk",
      "Web",
      "Digital",
      "Numérique",
      "Applicatif",
      "Système",
      "Réseau",
      "SI",
      "IT",
      "Data",
      "Cloud",
      "Cyber",
      "Infrastructure",
    ],
  },
];

type FilterKey = "positive" | "negative" | "allow" | "alwaysAllow" | "block" | "blockHard";

function Label({
  children,
  count = 0,
  restorableCount = 0,
  onClear,
  onRestore,
  isFr = true,
}: {
  children: React.ReactNode;
  count?: number;
  restorableCount?: number;
  onClear?: () => void;
  onRestore?: () => void;
  isFr?: boolean;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-4">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-foreground">{children}</span>
        {count > 0 && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10 transition-colors"
            title={isFr ? "Effacer cette catégorie de filtre" : "Clear this category"}
          >
            <X className="size-3" />
            <span>{isFr ? `Effacer (${count})` : `Clear (${count})`}</span>
          </button>
        ) : restorableCount > 0 && onRestore ? (
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-brand hover:underline hover:bg-brand-soft/50 transition-colors"
            title={isFr ? "Restaurer les éléments précédemment effacés" : "Restore cleared items"}
          >
            <RotateCcw className="size-3" />
            <span>{isFr ? `Restaurer (${restorableCount})` : `Restore (${restorableCount})`}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function FilterBuilder({
  filters,
  onChange,
  seededFrom = [],
}: {
  filters: ExploreFilters;
  onChange: (f: ExploreFilters) => void;
  seededFrom?: string[];
}) {
  const { locale } = useI18n();
  const isFr = locale === "fr";
  const [history, setHistory] = useState<{
    all?: ExploreFilters;
    positive?: string[];
    negative?: string[];
    allow?: string[];
    alwaysAllow?: string[];
    block?: string[];
    blockHard?: string[];
  }>({});

  const set = (patch: Partial<ExploreFilters>) => onChange({ ...filters, ...patch });
  const recencyList = isFr ? RECENCY_FR : RECENCY_EN;

  const hasAnyFilter =
    filters.positive.length > 0 ||
    filters.negative.length > 0 ||
    filters.allow.length > 0 ||
    filters.alwaysAllow.length > 0 ||
    filters.block.length > 0 ||
    filters.blockHard.length > 0;

  const clearCategory = (key: FilterKey) => {
    setHistory((prev) => ({ ...prev, [key]: [...filters[key]] }));
    set({ [key]: [] });
  };

  const restoreCategory = (key: FilterKey) => {
    const saved = history[key];
    if (saved && saved.length > 0) {
      set({ [key]: saved });
      setHistory((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  const clearAllFilters = () => {
    setHistory((prev) => ({ ...prev, all: { ...filters } }));
    onChange({
      ...filters,
      positive: [],
      negative: [],
      allow: [],
      alwaysAllow: [],
      block: [],
      blockHard: [],
      ats: ["portals"],
    });
  };

  const restoreAllFilters = () => {
    if (history.all) {
      onChange({ ...history.all });
      setHistory((prev) => ({ ...prev, all: undefined }));
    }
  };

  return (
    <div className="space-y-4">
      <style>{STYLE}</style>

      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {isFr ? "Filtres de recherche" : "Search filters"}
        </span>
        {hasAnyFilter ? (
          <button
            type="button"
            onClick={clearAllFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="size-3.5" />
            <span>{isFr ? "Effacer tous les filtres" : "Clear all filters"}</span>
          </button>
        ) : history.all ? (
          <button
            type="button"
            onClick={restoreAllFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand hover:brightness-110 transition-colors"
          >
            <RotateCcw className="size-3.5" />
            <span>{isFr ? "Restaurer les filtres" : "Restore filters"}</span>
          </button>
        ) : null}
      </div>

      <div>
        <Label
          count={filters.positive.length}
          restorableCount={history.positive?.length || 0}
          onClear={() => clearCategory("positive")}
          onRestore={() => restoreCategory("positive")}
          isFr={isFr}
        >
          {isFr ? "Postes à rechercher" : "Roles to find"}
        </Label>

        {/* Boutons de sélection rapide par catégorie métier */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted mr-0.5">
            {isFr ? "Catégories rapides :" : "Quick categories:"}
          </span>
          {PRESET_CATEGORIES.map((cat) => {
            const hasAny = cat.roles.some((r) => filters.positive.includes(r));
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => set({ positive: [...cat.roles] })}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  hasAny
                    ? "border-brand/40 bg-brand-soft text-brand font-semibold"
                    : "border-border/70 bg-surface/50 text-muted hover:text-foreground hover:border-brand/30",
                )}
                title={isFr ? `Filtrer uniquement sur ${cat.labelFr}` : `Filter by ${cat.labelEn}`}
              >
                {isFr ? cat.labelFr : cat.labelEn}
              </button>
            );
          })}
        </div>

        <KeywordField
          ariaLabel={isFr ? "Postes à rechercher" : "Roles to find"}
          values={filters.positive}
          tone="inc"
          placeholder={isFr ? "Développeur web, Support IT, Technicien informatique, Logistique…" : "AI platform, ML infrastructure, staff engineer…"}
          onChange={(v) => set({ positive: v })}
        />
      </div>

      <div>
        <Label
          count={filters.negative.length}
          restorableCount={history.negative?.length || 0}
          onClear={() => clearCategory("negative")}
          onRestore={() => restoreCategory("negative")}
          isFr={isFr}
        >
          {isFr ? "Mots-clés à exclure" : "Exclude"}
        </Label>
        <KeywordField
          ariaLabel={isFr ? "Mots-clés à exclure" : "Exclude"}
          values={filters.negative}
          tone="exc"
          placeholder={isFr ? "manager, commercial, freelance, alternance…" : "manager, sales, contract…"}
          onChange={(v) => set({ negative: v })}
        />
      </div>

      <div>
        <Label
          count={filters.allow.length}
          restorableCount={history.allow?.length || 0}
          onClear={() => clearCategory("allow")}
          onRestore={() => restoreCategory("allow")}
          isFr={isFr}
        >
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5 text-muted" /> {isFr ? "Ville ou localisation" : "City or location"}
          </span>
        </Label>
        <KeywordField
          values={filters.allow}
          tone="inc"
          placeholder={isFr ? "Béthune, Bruay, Lens, Arras, Saint-Omer, Pas-de-Calais, 62…" : "Toronto, New York, London…"}
          ariaLabel={isFr ? "Ville ou localisation" : "City or location"}
          onChange={(v) => set({ allow: v })}
        />
      </div>

      <div>
        <Label
          count={filters.block.length}
          restorableCount={history.block?.length || 0}
          onClear={() => clearCategory("block")}
          onRestore={() => restoreCategory("block")}
          isFr={isFr}
        >
          <span className="inline-flex items-center gap-1.5">
            <Ban className="size-3.5 text-muted" /> {isFr ? "Lieux à exclure" : "Exclude locations"}
          </span>
        </Label>
        <KeywordField
          values={filters.block}
          tone="exc"
          placeholder={isFr ? "Lille, Roubaix, Paris…" : "Paris, London…"}
          ariaLabel={isFr ? "Lieux à exclure" : "Exclude locations"}
          onChange={(v) => set({ block: v })}
        />
      </div>

      <div>
        <Label>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5 text-muted" /> {isFr ? "Publié depuis" : "Posted within"}
          </span>
        </Label>
        <div className="inline-flex rounded-lg border border-border bg-surface/40 p-0.5">
          {recencyList.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => set({ sinceDays: r.days })}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors max-sm:min-h-11",
                (filters.sinceDays || 0) === r.days ? "bg-brand-soft text-brand font-semibold" : "text-muted hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
