import { useMemo } from "react";
import { seededRand } from "@/lib/util";

interface WaveformProps {
  seed: number;
  /** 0..1 progress of the playhead through this track */
  progress?: number;
  bars?: number;
  height?: number;
  active?: boolean;
  className?: string;
}

/**
 * A generated SVG waveform (peaks from a seeded RNG so it's stable per track).
 * Played portion tints to the energy gradient; the rest is mist.
 */
export function Waveform({
  seed,
  progress = 0,
  bars = 96,
  height = 56,
  active = false,
  className = "",
}: WaveformProps) {
  const peaks = useMemo(() => {
    const rnd = seededRand(seed);
    const out: number[] = [];
    for (let i = 0; i < bars; i += 1) {
      // envelope: a track has quiet intro, body, brief breakdown, peak
      const t = i / bars;
      const env =
        0.35 +
        0.45 * Math.sin(t * Math.PI) +
        0.2 * Math.sin(t * Math.PI * 6) * (t > 0.55 ? 1 : 0.3);
      const v = Math.max(0.06, Math.min(1, env * (0.55 + rnd() * 0.7)));
      out.push(v);
    }
    return out;
  }, [seed, bars]);

  const gap = 2;
  const barW = 3;
  const width = bars * (barW + gap);
  const playedIndex = Math.floor(progress * bars);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`wf-${seed}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF3D81" />
          <stop offset="50%" stopColor="#FF9F1C" />
          <stop offset="100%" stopColor="#2EC4B6" />
        </linearGradient>
      </defs>
      {peaks.map((p, i) => {
        const bh = p * height;
        const played = i <= playedIndex;
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={(height - bh) / 2}
            width={barW}
            height={bh}
            rx={1}
            fill={played && active ? `url(#wf-${seed})` : played ? "#5b5866" : "#2A2A36"}
            opacity={played ? 1 : 0.7}
          />
        );
      })}
      {active && (
        <rect
          x={playedIndex * (barW + gap)}
          y={0}
          width={1.5}
          height={height}
          fill="#3DFF88"
        />
      )}
    </svg>
  );
}
