"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

export type MoreMenuItem = { key: string; text: string; icon: ComponentType<{ className?: string }>; onSelect: () => void; hint?: string };

/** Menu « Autres actions » d'une offre : ce qui sert moins souvent que Postuler et Pas intéressé. */
export function MoreMenu({ items, label }: { items: MoreMenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center justify-center rounded-md border border-border px-2.5 py-2 text-muted transition-colors hover:border-brand/40 hover:text-foreground max-sm:min-h-[44px] max-sm:min-w-[44px]",
          open && "border-brand/40 text-foreground",
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute bottom-full right-0 z-20 mb-1.5 w-60 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          {items.map(({ key, text, icon: Icon, onSelect, hint }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-surface-hover max-sm:min-h-11"
            >
              <Icon className="size-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">{text}</span>
              {hint && <span className="shrink-0 text-[11px] text-faint">{hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
