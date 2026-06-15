/**
 * Doremix wordmark (v2). "Doremi" + "x" where the x is a crossfade — two
 * crossing strokes, spectrum-tinted. The mark is three rising EQ bars
 * (40/70/100%), spectrum-filled and glowing. Beat-reactive when `live`.
 */

const SPECTRUM_STOPS = [
  { offset: "0%", color: "#FF2E97" },
  { offset: "20%", color: "#FF6B3D" },
  { offset: "40%", color: "#FFB627" },
  { offset: "60%", color: "#2EE6C4" },
  { offset: "80%", color: "#2EA8FF" },
  { offset: "100%", color: "#9B5CFF" },
];

export function DoremixMark({ size = 22, live = false }: { size?: number; live?: boolean }) {
  const w = size;
  const h = size;
  const barW = w * 0.22;
  const gap = w * 0.11;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      className={live ? "animate-beat-glow" : ""}
    >
      <defs>
        <linearGradient id="mark-grad" x1="0" y1="1" x2="1" y2="0">
          {SPECTRUM_STOPS.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      {[0.4, 0.7, 1].map((frac, i) => {
        const bh = h * frac;
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={h - bh}
            width={barW}
            height={bh}
            rx={barW * 0.35}
            fill="url(#mark-grad)"
          />
        );
      })}
    </svg>
  );
}

export function Wordmark({
  className = "",
  live = false,
}: {
  className?: string;
  live?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-display font-semibold tracking-tightish ${className}`}
    >
      <DoremixMark size={18} live={live} />
      <span className="text-paper">
        Doremi
        {/* crossfade x — two crossing waveform strokes, spectrum-tinted */}
        <span className="relative inline-flex items-center justify-center">
          <svg
            width="0.72em"
            height="0.72em"
            viewBox="0 0 24 24"
            className="inline-block translate-y-[0.06em]"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="wm-x" x1="0" y1="0" x2="1" y2="1">
                {SPECTRUM_STOPS.map((s) => (
                  <stop key={s.offset} offset={s.offset} stopColor={s.color} />
                ))}
              </linearGradient>
            </defs>
            {/* fading-out stroke */}
            <path
              d="M3 4 Q8 12 21 20"
              fill="none"
              stroke="url(#wm-x)"
              strokeWidth="3.2"
              strokeLinecap="round"
              opacity="0.55"
            />
            {/* fading-in stroke */}
            <path
              d="M21 4 Q16 12 3 20"
              fill="none"
              stroke="url(#wm-x)"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </span>
    </span>
  );
}
