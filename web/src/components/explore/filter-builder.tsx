"use client";

import { useState, useEffect, useRef } from "react";
import { X, Ban, Clock, MapPin, Trash2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { cleanChips, RECENCY_FR, RECENCY_EN, type ExploreFilters } from "@/lib/explore";
import { useI18n } from "@/components/i18n-provider";

interface CitySuggestion {
  nom: string;
  codePostal: string;
  departement: string;
  label: string;
  codeInsee: string;
}

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
  isCitySearch,
  onChange,
}: {
  values: string[];
  tone: "inc" | "exc";
  placeholder: string;
  ariaLabel?: string;
  isCitySearch?: boolean;
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isCitySearch || !draft || draft.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/explore/cities?q=${encodeURIComponent(draft.trim())}`);
        if (res.ok) {
          const list = await res.json();
          setSuggestions(list);
          setShowSuggestions(list.length > 0);
          setHighlightedIndex(-1);
        }
      } catch {
        /* ignore */
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [draft, isCitySearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const commit = (text: string) => {
    const parts = text.split(/[,\n;\t\r]+/);
    const next = cleanChips([...values, ...parts]);
    onChange(next);
    setDraft("");
    setShowSuggestions(false);
  };

  const selectSuggestion = (city: CitySuggestion) => {
    commit(city.nom);
  };

  return (
    <div ref={wrapperRef} className="relative">
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
          onFocus={() => {
            if (isCitySearch && suggestions.length > 0) setShowSuggestions(true);
          }}
          onKeyDown={(e) => {
            if (showSuggestions && suggestions.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlightedIndex((i) => Math.min(suggestions.length - 1, i + 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlightedIndex((i) => Math.max(0, i - 1));
                return;
              }
              if (e.key === "Enter" && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
                e.preventDefault();
                selectSuggestion(suggestions[highlightedIndex]);
                return;
              }
              if (e.key === "Escape") {
                setShowSuggestions(false);
                return;
              }
            }
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
            if (/[,;\n\t\r]/.test(text)) commit(merged);
            else setDraft(merged);
          }}
          onBlur={() => {
            setTimeout(() => {
              if (draft.trim() && !showSuggestions) commit(draft);
            }, 200);
          }}
          placeholder={values.length ? "" : placeholder}
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-border/80 bg-surface shadow-xl p-1 text-xs">
          <div className="px-2 py-1 text-[10px] font-semibold text-muted uppercase tracking-wider border-b border-border/40 mb-1">
            Communes suggérées
          </div>
          {suggestions.map((s, idx) => (
            <button
              key={`${s.codeInsee}-${s.codePostal}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(s);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                highlightedIndex === idx
                  ? "bg-brand/15 text-brand font-medium"
                  : "text-foreground hover:bg-surface-hover hover:text-brand",
              )}
            >
              <span className="font-medium">
                {s.nom} <span className="text-muted font-normal">({s.codePostal})</span>
              </span>
              <span className="text-[10px] text-muted">{s.departement}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CityOriginInput({
  value,
  onChange,
  onSelect,
  placeholder = "Lières",
  isFr = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (nom: string, cp: string) => void;
  placeholder?: string;
  isFr?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value || value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/explore/cities?q=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const list = await res.json();
          setSuggestions(list);
          setOpen(list.length > 0);
          setHighlightedIndex(-1);
        }
      } catch {
        /* ignore */
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectItem = (city: CitySuggestion) => {
    onChange(city.nom);
    onSelect(city.nom, city.codePostal);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (open && suggestions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlightedIndex((i) => Math.min(suggestions.length - 1, i + 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightedIndex((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === "Enter" && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
              e.preventDefault();
              selectItem(suggestions[highlightedIndex]);
              return;
            }
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
          }
        }}
        className="h-7 w-36 rounded-md border border-border/80 bg-background px-2.5 text-xs font-medium text-foreground focus:border-brand focus:ring-1 focus:ring-brand/30 focus:outline-none transition-colors"
        placeholder={placeholder}
      />

      {open && suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-64 overflow-y-auto rounded-lg border border-border/80 bg-surface shadow-xl p-1 text-xs">
          <div className="px-2 py-1 text-[10px] font-semibold text-muted uppercase tracking-wider border-b border-border/40 mb-1">
            {isFr ? "Communes suggérées" : "Suggested cities"}
          </div>
          {suggestions.map((s, idx) => (
            <button
              key={`${s.codeInsee}-${s.codePostal}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectItem(s);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                highlightedIndex === idx
                  ? "bg-brand/15 text-brand font-medium"
                  : "text-foreground hover:bg-surface-hover hover:text-brand",
              )}
            >
              <span className="font-medium">
                {s.nom} <span className="text-muted font-normal">({s.codePostal})</span>
              </span>
              <span className="text-[10px] text-muted">{s.departement}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


const COMMUTE_PRESETS = [
  { minutes: 15, labelFr: "⏱️ 15 min", labelEn: "⏱️ 15 min", descFr: "< 15 min en voiture", descEn: "< 15 min driving" },
  { minutes: 30, labelFr: "⏱️ 30 min", labelEn: "⏱️ 30 min", descFr: "~30 min (Bassin minier & Artois)", descEn: "~30 min (Artois & Basin)" },
  { minutes: 45, labelFr: "⏱️ 45 min", labelEn: "⏱️ 45 min", descFr: "~45 min (+ Arras & alentours)", descEn: "~45 min (+ Arras area)" },
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

  const [originCity, setOriginCity] = useState(filters.originCity || "Lières");
  const [zoneFeedback, setZoneFeedback] = useState<{
    loading?: boolean;
    count?: number;
    km?: number;
    city?: string;
  }>({
    count: 374,
    km: 30,
    city: filters.originCity || "Lières",
  });

  const selectCommute = async (minutes: number, cityOverride?: string) => {
    const city = (cityOverride || originCity).trim() || "Lières";
    set({ commuteMinutes: minutes, originCity: city });
    setZoneFeedback((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/explore/zone?minutes=${minutes}&ville=${encodeURIComponent(city)}`);
      if (res.ok) {
        const data = await res.json();
        setZoneFeedback({
          loading: false,
          count: data.communesCount,
          km: data.rayonMaxKm,
          city,
        });
      } else {
        setZoneFeedback((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      setZoneFeedback((prev) => ({ ...prev, loading: false }));
    }
  };

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
        <Label isFr={isFr}>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5 text-muted" /> {isFr ? "Zone de trajet & Localisation" : "Commute Zone & Location"}
          </span>
        </Label>

        {/* Barre de configuration de la zone : Ville de départ + Durées + Télétravail */}
        <div className="space-y-2 rounded-lg border border-border/70 bg-surface/30 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted">
                {isFr ? "Ville de départ :" : "Starting city:"}
              </span>
              <CityOriginInput
                value={originCity}
                onChange={(val) => {
                  setOriginCity(val);
                  set({ originCity: val });
                }}
                onSelect={(nom) => {
                  setOriginCity(nom);
                  set({ originCity: nom });
                  if (filters.commuteMinutes) {
                    selectCommute(filters.commuteMinutes, nom);
                  }
                }}
                placeholder="Lières"
                isFr={isFr}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted mr-0.5">
                {isFr ? "Temps de trajet :" : "Commute time:"}
              </span>
              {COMMUTE_PRESETS.map((p) => {
                const isActive = (filters.commuteMinutes ?? 30) === p.minutes;
                return (
                  <button
                    key={p.minutes}
                    type="button"
                    onClick={() => selectCommute(p.minutes)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all shadow-xs",
                      isActive
                        ? "border-brand bg-brand-soft text-brand font-semibold ring-1 ring-brand/30"
                        : "border-border/70 bg-surface/60 text-muted hover:text-foreground hover:border-brand/30",
                    )}
                    title={isFr ? p.descFr : p.descEn}
                  >
                    {isFr ? p.labelFr : p.labelEn}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => set({ remoteOnly: !filters.remoteOnly })}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all shadow-xs",
                  filters.remoteOnly
                    ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold ring-1 ring-emerald-500/30"
                    : "border-border/70 bg-surface/60 text-muted hover:text-foreground hover:border-emerald-500/30",
                )}
                title={isFr ? "Afficher uniquement les offres en télétravail complet" : "Show only 100% remote positions"}
              >
                🏠 {isFr ? "Télétravail uniquement" : "Remote only"}
              </button>
            </div>
          </div>

          {/* Badge informatif de couverture de zone */}
          {zoneFeedback.count ? (
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>
                {isFr
                  ? `Zone active : ${zoneFeedback.count} communes couvertes (~${zoneFeedback.km} km en voiture autour de ${zoneFeedback.city})`
                  : `Active zone: ${zoneFeedback.count} municipalities covered (~${zoneFeedback.km} km driving around ${zoneFeedback.city})`}
              </span>
              {zoneFeedback.loading ? (
                <span className="text-[10px] text-muted animate-pulse">({isFr ? "calcul..." : "updating..."})</span>
              ) : null}
            </div>
          ) : null}
        </div>
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
          isCitySearch={true}
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
