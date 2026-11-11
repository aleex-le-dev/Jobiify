"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Nombre qui « monte » jusqu'à sa valeur (≈ 0,7 s, décélération douce).
 * Valeur immédiate si l'utilisateur demande moins d'animations.
 */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value === from.current) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const startValue = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(startValue + (value - startValue) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="tabular-nums">{shown}</span>;
}
