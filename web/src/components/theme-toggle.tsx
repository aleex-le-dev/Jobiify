"use client";

import { flushSync } from "react-dom";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useTheme } from "@/components/theme-provider";

type ViewTransitionDoc = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> };
};

export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";

  // Changement de thème en « révélation circulaire » depuis le bouton cliqué
  // (View Transitions API). Repli instantané si le navigateur ne la gère pas
  // ou si l'utilisateur a demandé moins d'animations.
  const onToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    const doc = document as ViewTransitionDoc;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || reduced) {
      toggleTheme();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = doc.startViewTransition(() => flushSync(() => toggleTheme()));
    transition.ready
      .then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
        );
      })
      .catch(() => {});
  };

  return (
    <Button
      variant="ghost"
      size={showLabel ? "default" : "icon"}
      type="button"
      onClick={onToggle}
      aria-label="Mode sombre"
      aria-pressed={dark}
      title={dark ? "Passer en mode clair" : "Passer en mode sombre"}
      className={cn("text-muted", showLabel && "w-full justify-start px-2 text-xs", className)}
    >
      <span key={dark ? "sun" : "moon"} className="inline-flex animate-[spin-in_420ms_cubic-bezier(0.34,1.56,0.64,1)_both]">
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </span>
      {showLabel && <span>{dark ? "Mode clair" : "Mode sombre"}</span>}
    </Button>
  );
}
