"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";

export type City = { nom: string; codePostal: string; codeInsee: string; departement?: string };

type Suggestion = City & { codesPostaux?: string[]; departement: string };

/**
 * Choix d'une commune avec son code postal : la liste montre nom, code postal et
 * département, pour distinguer les homonymes (Fleury dans le 62 et dans le 14…).
 * La commune retenue garde son code INSEE, utilisé pour calculer la zone de trajet.
 */
export function CityPicker({
  value,
  onChange,
  label = "Ville de départ",
  className,
}: {
  value: City;
  onChange: (city: City) => void;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value.codePostal ? `${value.nom} (${value.codePostal})` : value.nom);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Recherche par nom ou par code postal (« 62190 » liste toutes les communes de ce code).
  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.replace(/\s*\(.*$/, "").trim();
    if (query.length < 2) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/explore/cities?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((d: Suggestion[]) => {
          setItems(Array.isArray(d) ? d : []);
          setActive(0);
          setOpen(true);
        })
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 180);
  };

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (s: Suggestion) => {
    onChange({ nom: s.nom, codePostal: s.codePostal, codeInsee: s.codeInsee, departement: s.departement });
    setText(`${s.nom} (${s.codePostal})`);
    setOpen(false);
  };

  // Homonymes : un même nom présent plusieurs fois dans la liste.
  const names = items.map((s) => s.nom.toLowerCase());
  const isHomonym = (s: Suggestion) => names.filter((n) => n === s.nom.toLowerCase()).length > 1;

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <label htmlFor={id} className="block text-[12px] text-muted">
        {label}
      </label>
      <div className="relative mt-1">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input
          id={id}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            search(e.target.value);
            // Saisie libre : plus de commune identifiée tant qu'on n'a pas choisi dans la liste.
            onChange({ nom: e.target.value.replace(/\s*\(.*$/, "").trim(), codePostal: "", codeInsee: "" });
          }}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !items.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(items.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(items[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Nom de la commune ou code postal"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          className="w-full rounded-lg border border-border bg-background/60 py-2 pl-9 pr-9 text-[13px] text-foreground outline-none focus:border-brand/40"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-faint" />
        ) : value.codeInsee ? (
          <Check className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-brand" aria-label="Commune identifiée" />
        ) : null}
      </div>
      {!value.codeInsee && value.nom && (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Choisissez la commune dans la liste pour lever toute ambiguïté.</p>
      )}
      {open && items.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="panel animate-rise absolute z-30 mt-1 max-h-72 w-full min-w-[18rem] overflow-y-auto p-1 shadow-lg"
        >
          {items.map((s, i) => (
            <li key={s.codeInsee} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-[13px]",
                  i === active ? "bg-surface-hover" : "",
                )}
              >
                <span className="font-mono text-[12px] font-semibold text-brand-text">{s.codePostal}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{s.nom}</span>
                  <span className="block truncate text-[11px] text-faint">
                    {s.departement}
                    {s.codesPostaux && s.codesPostaux.length > 1 ? ` · aussi ${s.codesPostaux.filter((c) => c !== s.codePostal).slice(0, 3).join(", ")}` : ""}
                  </span>
                </span>
                {isHomonym(s) && <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">homonyme</span>}
                {value.codeInsee === s.codeInsee && <Check className="size-4 shrink-0 text-brand" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
