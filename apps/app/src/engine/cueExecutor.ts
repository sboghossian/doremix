/**
 * The pure executor. Given a cue sheet, the current bar, and the set of tracks
 * whose BPM we actually know, it resolves the full audio picture at that bar:
 *
 *   - which CueTrack sits on each deck (1 = A, 2 = B)
 *   - the active transition (if nowBar is inside a transition window)
 *   - per-deck gain / EQ / echo targets (from transitions.ts)
 *   - per-deck playbackRate (the beatmatch ratio against the outgoing tempo)
 *   - the StateReport fields the UI consumes
 *
 * It touches NO audio nodes. `RealEngine` calls `resolve()` every frame and
 * writes the result onto Web Audio params; the tests call it directly with
 * synthetic sheets to assert the bar clock + tempo-match + transition + re-plan
 * logic without an AudioContext.
 */

import type {
  CueSheet,
  CueTrack,
  CueTransition,
  DeckReport,
  DeckState,
  StateReport,
} from "@/types";
import {
  LOOKAHEAD_BARS,
  bpmAtBar,
  nextSafeEditBar,
  setLengthBars,
} from "./barClock";
import {
  neutralTargets,
  transitionTargets,
  type DeckTargets,
} from "./transitions";
import type { DeckId } from "./types";

/** The fully-resolved state of one deck at a bar. */
export interface DeckPlan {
  slot: DeckId;
  /** the cue-sheet track on this deck, if any */
  cue: CueTrack | null;
  state: DeckState;
  /** position within the track in bars (track-local) */
  trackBar: number;
  /** linear playback rate (beatmatch: outgoingBpm / thisTrackBpm) */
  playbackRate: number;
  /** audio targets (gain/eq/echo) for this instant */
  targets: DeckTargets;
}

export interface ResolvedFrame {
  nowBar: number;
  nowBpm: number;
  decks: DeckPlan[];
  activeTransition: CueTransition | null;
  lengthBars: number;
  report: StateReport;
}

/** The CueTrack sounding on `slot` at `nowBar` (latest play_in_bar ≤ nowBar). */
function currentCueForSlot(
  sheet: CueSheet,
  slot: DeckId,
  nowBar: number,
): CueTrack | null {
  let best: CueTrack | null = null;
  for (const t of sheet.tracks) {
    if (t.deck_slot === slot && t.play_in_bar <= nowBar) {
      if (!best || t.play_in_bar > best.play_in_bar) best = t;
    }
  }
  return best;
}

/** The next CueTrack staged on `slot` (earliest play_in_bar > nowBar). */
function nextCueForSlot(
  sheet: CueSheet,
  slot: DeckId,
  nowBar: number,
): CueTrack | null {
  let best: CueTrack | null = null;
  for (const t of sheet.tracks) {
    if (t.deck_slot === slot && t.play_in_bar > nowBar) {
      if (!best || t.play_in_bar < best.play_in_bar) best = t;
    }
  }
  return best;
}

/** The transition whose window contains nowBar, if any. */
export function activeTransitionAt(
  sheet: CueSheet,
  nowBar: number,
): CueTransition | null {
  for (const tr of sheet.transitions) {
    if (nowBar >= tr.start_bar && nowBar <= tr.start_bar + tr.duration_bars) {
      return tr;
    }
  }
  return null;
}

/** The CueTrack that owns the "outgoing" side of a transition. */
function trackOnDeck(sheet: CueSheet, deck: DeckId, nowBar: number): CueTrack | null {
  // During a transition both decks may carry a track; pick the one whose
  // play_in_bar is the most recent at-or-before the transition's reference bar.
  return currentCueForSlot(sheet, deck, nowBar) ?? nextCueForSlot(sheet, deck, nowBar);
}

/**
 * Resolve the whole audio picture at `nowBar`.
 *
 * `knownBpm(id)` returns the *real decoded* BPM for a track id, or undefined if
 * it isn't loaded/analyzed yet — in which case we fall back to the cue sheet's
 * declared bpm so the math still produces something sane (graceful degrade).
 */
export function resolveFrame(
  sheet: CueSheet,
  nowBar: number,
  knownBpm: (trackId: string) => number | undefined,
): ResolvedFrame {
  const lengthBars = setLengthBars(sheet);
  const nowBpm = bpmAtBar(sheet.global.tempo_curve, nowBar);
  const transition = activeTransitionAt(sheet, nowBar);

  const progress = transition
    ? Math.max(
        0,
        Math.min(1, (nowBar - transition.start_bar) / (transition.duration_bars || 1)),
      )
    : 0;

  const tt = transition ? transitionTargets(transition, progress, nowBar) : null;

  const decks: DeckPlan[] = ([1, 2] as DeckId[]).map((slot) => {
    const cue = currentCueForSlot(sheet, slot, nowBar);
    let state: DeckState = "idle";
    let trackBar = 0;
    if (cue) {
      state = "playing";
      trackBar = nowBar - cue.play_in_bar + cue.cue_in_bar;
    } else {
      const upcoming = nextCueForSlot(sheet, slot, nowBar);
      if (upcoming) state = "cued";
    }

    // beatmatch: stretch this deck so its track tempo == the set tempo at nowBar.
    const trackBpm = cue ? (knownBpm(cue.track_id) ?? cue.bpm) : undefined;
    const playbackRate =
      trackBpm && trackBpm > 0 ? clampRate(nowBpm / trackBpm) : 1;

    // audio targets: default neutral, overridden by the active transition.
    let targets: DeckTargets = neutralTargets();
    if (transition && tt) {
      if (slot === transition.from_deck) {
        targets = tt.from;
        if (cue) state = "playing";
      } else if (slot === transition.to_deck) {
        targets = tt.to;
        // the incoming deck is "playing" (audible) during the blend
        const incoming = trackOnDeck(sheet, slot, transition.start_bar);
        if (incoming && targets.gain > 0.01) state = "playing";
      } else if (state === "idle") {
        targets.gain = 0;
      }
    } else if (state !== "playing") {
      targets.gain = 0;
    }

    return { slot, cue, state, trackBar, playbackRate, targets };
  });

  const report: StateReport = {
    now_bar: Math.round(nowBar * 10) / 10,
    now_bpm: Math.round(nowBpm * 10) / 10,
    plan_version_running: sheet.version,
    decks: decks.map(toDeckReport),
    active_transition: transition?.id ?? null,
    time_remaining_in_set_bars: Math.max(0, Math.round(lengthBars - nowBar)),
    next_safe_edit_bar: nextSafeEditBar(nowBar),
    buffer_planned_until_bar: Math.min(
      lengthBars,
      Math.round(nowBar + LOOKAHEAD_BARS),
    ),
  };

  return { nowBar, nowBpm, decks, activeTransition: transition, lengthBars, report };
}

function clampRate(r: number): number {
  if (!Number.isFinite(r) || r <= 0) return 1;
  return Math.max(0.6, Math.min(1.6, r));
}

function toDeckReport(d: DeckPlan): DeckReport {
  const base: DeckReport = {
    slot: d.slot,
    track_id: d.cue?.track_id ?? "",
    state: d.cue ? d.state : d.state === "cued" ? "cued" : "idle",
    track_bar: Math.max(0, Math.round(d.trackBar * 10) / 10),
  };
  if (d.state === "playing") base.active_stems = ["drums", "bass"];
  return base;
}

/**
 * Re-plan freeze: produce the cue sheet the engine should actually run after an
 * `update(next)`, keeping the frozen past from `current` and adopting only the
 * tail (bars ≥ freezeBar) from `next`. Mirrors the spec's double-buffer swap.
 *
 * `freezeBar` is normally `next.valid_from_bar` (which the conductor sets to the
 * reported `next_safe_edit_bar`). The engine still defends here so a malformed
 * conductor edit can never rewrite the playing bar.
 */
export function applyReplanFreeze(
  current: CueSheet,
  next: CueSheet,
  freezeBar: number,
): CueSheet {
  // Past (strictly below freezeBar) comes from what's already committed.
  const pastTracks = current.tracks.filter((t) => t.play_in_bar < freezeBar);
  const pastTransitions = current.transitions.filter((t) => t.start_bar < freezeBar);
  const pastTempo = current.global.tempo_curve.filter((p) => p.bar < freezeBar);
  const pastEnergy = current.global.energy_curve.filter((p) => p.bar < freezeBar);

  // Future (≥ freezeBar) comes from the new plan only.
  const futureTracks = next.tracks.filter((t) => t.play_in_bar >= freezeBar);
  const futureTransitions = next.transitions.filter((t) => t.start_bar >= freezeBar);
  const futureTempo = next.global.tempo_curve.filter((p) => p.bar >= freezeBar);
  const futureEnergy = next.global.energy_curve.filter((p) => p.bar >= freezeBar);

  return {
    plan_id: next.plan_id,
    version: next.version,
    valid_from_bar: freezeBar,
    global: {
      key_policy: next.global.key_policy,
      tempo_curve: [...pastTempo, ...futureTempo],
      energy_curve: [...pastEnergy, ...futureEnergy],
    },
    tracks: [...pastTracks, ...futureTracks],
    transitions: [...pastTransitions, ...futureTransitions],
    stem_ops: next.stem_ops ?? [],
  };
}
