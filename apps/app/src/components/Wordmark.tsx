/**
 * Doremix wordmark. "Doremi" + "x" where the x is a crossfade: two short
 * waveform strokes crossing, one fading out, one fading in, gradient-tinted.
 * The mark (standalone) is three rising EQ bars at 40/70/100% heights.
 */

export function DoremixMark({ size = 22 }: { size?: number }) {
  const w = size;
  const h = size;
  const barW = w * 0.22;
  const gap = w * 0.11;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id="mark-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF3D81" />
          <stop offset="50%" stopColor="#FF9F1C" />
          <stop offset="100%" stopColor="#2EC4B6" />
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

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-display font-semibold tracking-tightish ${className}`}
    >
      <DoremixMark size={18} />
      <span className="text-paper">
        Doremi<span className="text-gradient">x</span>
      </span>
    </span>
  );
}
