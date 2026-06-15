import type { CueSheet, Track } from "@/types";

/** Build a quick id→track index for the booth/cue-sheet rendering. */
export function trackIndex(library: Track[]): Map<string, Track> {
  const m = new Map<string, Track>();
  for (const t of library) m.set(t.id, t);
  return m;
}

export function setLengthBars(sheet: CueSheet): number {
  let max = 0;
  for (const t of sheet.tracks) {
    max = Math.max(max, t.play_in_bar + (t.cue_out_bar - t.cue_in_bar));
  }
  return Math.max(max, 64);
}

/** Approx minutes remaining from bars at the live bpm (4 beats/bar). */
export function barsToTime(bars: number, bpm: number): string {
  const seconds = (bars * 4 * 60) / Math.max(1, bpm);
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
