import { useMemo } from "react";
import type { CueSheet } from "@/types";
import { sampleCurve } from "@/lib/util";

interface EnergyCurveProps {
  sheet: CueSheet;
  nowBar: number;
  lengthBars: number;
  /** allow seeking by clicking the curve */
  onSeek?: (bar: number) => void;
  height?: number;
  /** is the set playing (controls the beat-pulse on the playhead) */
  live?: boolean;
}

const W = 1000;
const PAD = 8;

/**
 * The big LIVE ENERGY CURVE across the whole set timeline — the brand hero.
 * v2: a glowing, spectrum-lit line with a moving playhead, beat-reactive glow
 * when live, transition + frozen-floor markers.
 */
export function EnergyCurve({
  sheet,
  nowBar,
  lengthBars,
  onSeek,
  height = 200,
  live = false,
}: EnergyCurveProps) {
  const H = height;

  const samples = useMemo(() => {
    const pts = sheet.global.energy_curve.map((p) => ({ bar: p.bar, value: p.energy }));
    const n = 160;
    const out: { x: number; y: number; bar: number }[] = [];
    for (let i = 0; i <= n; i += 1) {
      const bar = (i / n) * lengthBars;
      const e = sampleCurve(pts, bar);
      const x = PAD + (bar / lengthBars) * (W - PAD * 2);
      const y = PAD + (1 - e) * (H - PAD * 2);
      out.push({ x, y, bar });
    }
    return out;
  }, [sheet, lengthBars, H]);

  const linePath = useMemo(() => {
    if (samples.length === 0) return "";
    return samples
      .map((s, i) => `${i === 0 ? "M" : "L"} ${s.x.toFixed(1)} ${s.y.toFixed(1)}`)
      .join(" ");
  }, [samples]);

  const areaPath = useMemo(() => {
    if (samples.length === 0) return "";
    const top = samples
      .map((s, i) => `${i === 0 ? "M" : "L"} ${s.x.toFixed(1)} ${s.y.toFixed(1)}`)
      .join(" ");
    return `${top} L ${samples[samples.length - 1].x.toFixed(1)} ${H - PAD} L ${PAD} ${
      H - PAD
    } Z`;
  }, [samples, H]);

  const playX = PAD + (Math.min(nowBar, lengthBars) / lengthBars) * (W - PAD * 2);
  const playY =
    PAD +
    (1 -
      sampleCurve(
        sheet.global.energy_curve.map((p) => ({ bar: p.bar, value: p.energy })),
        nowBar,
      )) *
      (H - PAD * 2);

  function handleClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const bar = Math.max(0, Math.min(lengthBars, ratio * lengthBars));
    onSeek(bar);
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      onClick={handleClick}
      className={onSeek ? "cursor-pointer" : ""}
      style={{ width: "100%", height: H, display: "block" }}
      role="img"
      aria-label="Set energy curve"
    >
      <defs>
        <linearGradient id="ec-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF2E97" />
          <stop offset="20%" stopColor="#FF6B3D" />
          <stop offset="40%" stopColor="#FFB627" />
          <stop offset="60%" stopColor="#2EE6C4" />
          <stop offset="80%" stopColor="#2EA8FF" />
          <stop offset="100%" stopColor="#9B5CFF" />
        </linearGradient>
        <linearGradient id="ec-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF2E97" stopOpacity="0.26" />
          <stop offset="55%" stopColor="#2EA8FF" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#9B5CFF" stopOpacity="0" />
        </linearGradient>
        <clipPath id="ec-played">
          <rect x="0" y="0" width={playX} height={H} />
        </clipPath>
        <filter id="ec-glow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* baseline grid */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={PAD}
          x2={W - PAD}
          y1={PAD + g * (H - PAD * 2)}
          y2={PAD + g * (H - PAD * 2)}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
        />
      ))}

      {/* transition markers */}
      {sheet.transitions.map((tr) => {
        const x = PAD + (tr.start_bar / lengthBars) * (W - PAD * 2);
        return (
          <line
            key={tr.id}
            x1={x}
            x2={x}
            y1={PAD}
            y2={H - PAD}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        );
      })}

      {/* area fill under the curve */}
      <path d={areaPath} fill="url(#ec-area)" />

      {/* full curve, dim */}
      <path d={linePath} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={2} />

      {/* played portion, spectrum-lit + glowing */}
      <path
        d={linePath}
        fill="none"
        stroke="url(#ec-line)"
        strokeWidth={3}
        clipPath="url(#ec-played)"
        filter="url(#ec-glow)"
      />

      {/* frozen-floor marker (valid_from_bar) */}
      {sheet.valid_from_bar > 0 && (
        <line
          x1={PAD + (sheet.valid_from_bar / lengthBars) * (W - PAD * 2)}
          x2={PAD + (sheet.valid_from_bar / lengthBars) * (W - PAD * 2)}
          y1={PAD}
          y2={H - PAD}
          stroke="#3DFF88"
          strokeWidth={1}
          strokeOpacity={0.4}
        />
      )}

      {/* playhead */}
      <line x1={playX} x2={playX} y1={0} y2={H} stroke="#3DFF88" strokeWidth={1.5} />
      <circle
        cx={playX}
        cy={playY}
        r={live ? 6 : 4}
        fill="#3DFF88"
        className={live ? "animate-pulse-live" : ""}
        style={live ? { filter: "drop-shadow(0 0 8px rgba(61,255,136,0.9))" } : undefined}
      />
    </svg>
  );
}
