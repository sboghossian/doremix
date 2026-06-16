/**
 * Pure bar-clock math. 4/4 only (the v0 contract). No audio, no DOM, no React —
 * every function here is referentially transparent and unit-tested headlessly,
 * because a real AudioContext can't run in a node/jsdom test environment.
 *
 * The Engine owns the audio clock; this module is the arithmetic that maps the
 * cue sheet's *bars* onto the AudioContext's *seconds*, and back.
 */

import type { CueSheet, TempoPoint } from "@/types";

export const BEATS_PER_BAR = 4;

/** How far ahead of the playhead the engine stays committed (lookahead buffer). */
export const LOOKAHEAD_BARS = 24;

/** Edits + version swaps quantize to this phrase length (bars). */
export const PHRASE_BARS = 4;

/** Seconds that one bar lasts at a given BPM (4 beats / bar). */
export function barDurationSec(bpm: number): number {
  const safe = bpm > 0 ? bpm : 120;
  return (BEATS_PER_BAR * 60) / safe;
}

/** Seconds that one beat lasts at a given BPM. */
export function beatDurationSec(bpm: number): number {
  return barDurationSec(bpm) / BEATS_PER_BAR;
}

/**
 * The beatmatch ratio: stretch the incoming deck so its tempo equals the
 * currently-playing (outgoing) tempo. Pitch couples in v0 (playbackRate), which
 * the architecture accepts — keylock is a later upgrade.
 *
 *   playbackRate = outgoingBpm / incomingTrackBpm
 *
 * Guards against zero/NaN and clamps to a sane DJ range (±~40%) so a bad BPM
 * estimate can't produce a chipmunk/sludge artifact that breaks the mix.
 */
export function tempoMatchRatio(outgoingBpm: number, incomingTrackBpm: number): number {
  if (!Number.isFinite(outgoingBpm) || !Number.isFinite(incomingTrackBpm)) return 1;
  if (incomingTrackBpm <= 0 || outgoingBpm <= 0) return 1;
  const ratio = outgoingBpm / incomingTrackBpm;
  return Math.max(0.6, Math.min(1.6, ratio));
}

/** Round a bar up to the next phrase boundary (e.g. next multiple of 4). */
export function quantizeToPhrase(bar: number, phrase = PHRASE_BARS): number {
  return Math.ceil(bar / phrase) * phrase;
}

/**
 * Earliest bar the engine will accept new ops: the next phrase boundary past
 * the lookahead floor. The frozen past is everything strictly below this.
 */
export function nextSafeEditBar(nowBar: number, lookahead = LOOKAHEAD_BARS): number {
  return quantizeToPhrase(nowBar + lookahead);
}

/** Sample a tempo curve (piecewise-linear, sorted by bar) at a bar → BPM. */
export function bpmAtBar(curve: TempoPoint[], bar: number): number {
  if (curve.length === 0) return 120;
  if (bar <= curve[0].bar) return curve[0].bpm;
  const last = curve[curve.length - 1];
  if (bar >= last.bar) return last.bpm;
  for (let i = 0; i < curve.length - 1; i += 1) {
    const a = curve[i];
    const b = curve[i + 1];
    if (bar >= a.bar && bar <= b.bar) {
      const span = b.bar - a.bar || 1;
      const t = (bar - a.bar) / span;
      return a.bpm + (b.bpm - a.bpm) * t;
    }
  }
  return last.bpm;
}

/**
 * Total length of a set in bars: the furthest a track plays out to. Mirrors the
 * MockEngine's `setLengthBars` so the UI's remaining/length math is unchanged.
 */
export function setLengthBars(sheet: CueSheet): number {
  let max = 0;
  for (const t of sheet.tracks) {
    max = Math.max(max, t.play_in_bar + (t.cue_out_bar - t.cue_in_bar));
  }
  return Math.max(max, 64);
}

/**
 * Advance the bar position by `elapsedSec`, integrating along the tempo curve.
 * Because BPM can ramp, we step in small slices so a long tick doesn't overshoot
 * a tempo change. Returns the new (fractional) bar, clamped to `lengthBars`.
 */
export function advanceBar(
  fromBar: number,
  elapsedSec: number,
  curve: TempoPoint[],
  lengthBars: number,
): number {
  if (elapsedSec <= 0) return Math.min(fromBar, lengthBars);
  let bar = fromBar;
  let remaining = elapsedSec;
  // 60 micro-steps per call is plenty for a ~16ms..500ms tick.
  const STEP = Math.max(elapsedSec / 60, 0.004);
  let guard = 0;
  while (remaining > 0 && bar < lengthBars && guard < 10000) {
    const dt = Math.min(STEP, remaining);
    const bpm = bpmAtBar(curve, bar);
    bar += dt / barDurationSec(bpm);
    remaining -= dt;
    guard += 1;
  }
  return Math.min(bar, lengthBars);
}

/**
 * Convert a future bar to "seconds from now" given the current bar + tempo
 * curve. Used to schedule AudioBufferSourceNode start times against
 * `AudioContext.currentTime`. Integrates the curve so ramps are honored.
 */
export function secondsUntilBar(
  nowBar: number,
  targetBar: number,
  curve: TempoPoint[],
): number {
  if (targetBar <= nowBar) return 0;
  let seconds = 0;
  let bar = nowBar;
  const STEP = 0.25; // quarter-bar slices
  let guard = 0;
  while (bar < targetBar && guard < 100000) {
    const next = Math.min(bar + STEP, targetBar);
    const bpm = bpmAtBar(curve, (bar + next) / 2);
    seconds += (next - bar) * barDurationSec(bpm);
    bar = next;
    guard += 1;
  }
  return seconds;
}
