import { instrumentSerif } from "@/lib/fonts";

// Brand mark — "J" on brand orange in Instrument Serif. Matches the
// favicon and Jobiify visual identity.
export function CoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`${instrumentSerif.className} inline-flex shrink-0 items-center justify-center rounded-md bg-brand text-white font-bold`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.78),
        letterSpacing: "0.01em",
        lineHeight: 1,
        paddingBottom: Math.round(size * 0.08),
      }}
    >
      J
    </span>
  );
}
