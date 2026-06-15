import type { EnergyArc, Track } from "@/types";
import { clamp } from "./util";

/**
 * The energy-arc shape, normalized 0..1 over progress 0..1. Mirrors the curve
 * the MockConductor plans; used for the dashboard thumbnails and the compose
 * arc picker so the preview matches what gets spun.
 */
export function arcShape(arc: EnergyArc, t: number): number {
  switch (arc) {
    case "rising":
      return clamp(0.32 + 0.6 * t, 0, 1);
    case "wave":
      return clamp(
        0.45 + 0.4 * Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.2 * t,
        0,
        1,
      );
    case "plateau_peak":
      if (t < 0.55) return clamp(0.35 + 0.45 * (t / 0.55), 0, 1);
      if (t < 0.8) return clamp(0.8 + 0.15 * ((t - 0.55) / 0.25), 0, 1);
      return clamp(0.95 - 0.45 * ((t - 0.8) / 0.2), 0, 1);
  }
}

/** Sample the arc into N points (0..1) for a mini SVG thumbnail. */
export function arcSamples(arc: EnergyArc, n = 28): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i += 1) {
    out.push(arcShape(arc, i / n));
  }
  return out;
}

/** "122–128" BPM range across a crate (or em-dash when empty). */
export function bpmRange(tracks: Track[]): string {
  if (tracks.length === 0) return "—";
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of tracks) {
    lo = Math.min(lo, t.bpm);
    hi = Math.max(hi, t.bpm);
  }
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

/** "2h ago" / "yesterday" / "3d ago" for the last-touched line. */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return "yesterday";
  return `${day}d ago`;
}
