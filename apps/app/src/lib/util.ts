/** Tiny deterministic helpers used across the mocks. No external deps. */

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

let _seq = 0;
export function shortId(prefix = "t"): string {
  _seq += 1;
  return `${prefix}${_seq.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/**
 * Seeded pseudo-random (mulberry32) so waveforms/curves are stable across
 * re-renders for the same seed — important so the UI doesn't shimmer.
 */
export function seededRand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string to a 32-bit int (for stable per-track waveform seeds). */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Interpolate a piecewise-linear curve (sorted by bar) at a given bar. */
export function sampleCurve(
  points: { bar: number; value: number }[],
  bar: number,
): number {
  if (points.length === 0) return 0;
  if (bar <= points[0].bar) return points[0].value;
  const last = points[points.length - 1];
  if (bar >= last.bar) return last.value;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (bar >= a.bar && bar <= b.bar) {
      const t = (bar - a.bar) / (b.bar - a.bar || 1);
      return lerp(a.value, b.value, t);
    }
  }
  return last.value;
}
