import { useId } from "react";

// Marque Jobiify : un « j » jade sur fond anthracite. Le point du j évoque un
// repère de carte — la recherche se fait autour de chez soi. Identique à app/icon.svg.
export function CoMark({ size = 28, animated = false }: { size?: number; animated?: boolean }) {
  const gid = useId();
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 96 96" className={`shrink-0${animated ? " mark-animated" : ""}`}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3ED6A6" />
          <stop offset="1" stopColor="#139373" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="22" fill="#111A26" />
      <rect x="0.75" y="0.75" width="94.5" height="94.5" rx="21.25" fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1.5" />
      <path className="mark-stroke" d="M56 42 V60 a14 14 0 0 1 -28 0" fill="none" stroke={`url(#${gid})`} strokeWidth="12" strokeLinecap="round" />
      <circle className="mark-dot" cx="56" cy="24" r="8" fill="#3ED6A6" />
    </svg>
  );
}
