import { useMemo } from "react";
import type { CueSheet, EnergyArc } from "@/types";
import { arcSamples } from "@/lib/arc";
import { sampleCurve } from "@/lib/util";
import { setLengthBars } from "@/lib/lookup";

interface SetThumbnailProps {
  /** if the set is spun, render its real planned curve; else the brief's arc */
  arc: EnergyArc;
  sheet?: CueSheet | null;
  height?: number;
  className?: string;
  /** gradient id must be unique per instance on a page */
  uid: string;
}

const W = 240;
const PAD = 6;

/** Mini glowing energy-curve thumbnail for a set card. */
export function SetThumbnail({
  arc,
  sheet,
  height = 64,
  className = "",
  uid,
}: SetThumbnailProps) {
  const H = height;

  const points = useMemo<number[]>(() => {
    if (sheet && sheet.global.energy_curve.length > 1) {
      const pts = sheet.global.energy_curve.map((p) => ({
        bar: p.bar,
        value: p.energy,
      }));
      const len = setLengthBars(sheet);
      const n = 40;
      const out: number[] = [];
      for (let i = 0; i <= n; i += 1) {
        out.push(sampleCurve(pts, (i / n) * len));
      }
      return out;
    }
    return arcSamples(arc, 40);
  }, [sheet, arc]);

  const n = points.length - 1;
  const linePath = points
    .map((e, i) => {
      const x = PAD + (i / n) * (W - PAD * 2);
      const y = PAD + (1 - e) * (H - PAD * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${linePath} L ${(W - PAD).toFixed(1)} ${H - PAD} L ${PAD} ${
    H - PAD
  } Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height: H, display: "block" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`thumb-line-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF2E97" />
          <stop offset="33%" stopColor="#FFB627" />
          <stop offset="66%" stopColor="#2EE6C4" />
          <stop offset="100%" stopColor="#9B5CFF" />
        </linearGradient>
        <linearGradient id={`thumb-area-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF6B3D" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#FF6B3D" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#thumb-area-${uid})`} />
      <path
        d={linePath}
        fill="none"
        stroke={`url(#thumb-line-${uid})`}
        strokeWidth={2.4}
        strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 6px rgba(255,46,151,0.45))" }}
      />
    </svg>
  );
}
