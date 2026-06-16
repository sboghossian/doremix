/**
 * Engine PURE-logic smoke tests.
 *
 * A real AudioContext can't run in node/jsdom, so we exercise the deterministic
 * core that the RealEngine writes onto Web Audio params: the bar clock, the
 * tempo-match (beatmatch) ratio, transition gain scheduling, cue execution
 * (StateReport emission), and the re-plan freeze. If these are right, the audio
 * layer is just "write these numbers onto AudioParams".
 */

import { describe, expect, it } from "vitest";
import type { CueSheet } from "@/types";
import {
  advanceBar,
  barDurationSec,
  beatDurationSec,
  bpmAtBar,
  nextSafeEditBar,
  quantizeToPhrase,
  tempoMatchRatio,
} from "./barClock";
import {
  constantPower,
  transitionTargets,
} from "./transitions";
import {
  activeTransitionAt,
  applyReplanFreeze,
  resolveFrame,
} from "./cueExecutor";

// --- a tiny synthetic two-track cue sheet (mirrors what the conductor emits) ---
function makeSheet(version = 1, validFrom = 0): CueSheet {
  return {
    plan_id: "test-set",
    version,
    valid_from_bar: validFrom,
    global: {
      tempo_curve: [
        { bar: 0, bpm: 120 },
        { bar: 64, bpm: 128 },
      ],
      energy_curve: [
        { bar: 0, energy: 0.4 },
        { bar: 64, energy: 0.9 },
      ],
      key_policy: "harmonic",
    },
    tracks: [
      {
        deck_slot: 1,
        track_id: "lib:aaa",
        bpm: 124,
        key: "8A",
        play_in_bar: 0,
        cue_in_bar: 16,
        cue_out_bar: 80,
      },
      {
        deck_slot: 2,
        track_id: "lib:bbb",
        bpm: 126,
        key: "9A",
        play_in_bar: 64,
        cue_in_bar: 0,
        cue_out_bar: 64,
      },
    ],
    transitions: [
      {
        id: "t1",
        from_deck: 1,
        to_deck: 2,
        type: "bass_swap",
        start_bar: 56,
        duration_bars: 8,
        params: { eq_curve: "log", swap_at_bar: 60 },
      },
    ],
    stem_ops: [],
  };
}

describe("barClock", () => {
  it("bar/beat durations track BPM (4/4)", () => {
    expect(barDurationSec(120)).toBeCloseTo(2.0, 5); // 4 beats * 0.5s
    expect(beatDurationSec(120)).toBeCloseTo(0.5, 5);
    expect(barDurationSec(128)).toBeCloseTo(1.875, 5);
  });

  it("guards bad BPM instead of dividing by zero", () => {
    expect(barDurationSec(0)).toBeCloseTo(2.0, 5); // falls back to 120
    expect(Number.isFinite(barDurationSec(-5))).toBe(true);
  });

  it("samples a piecewise-linear tempo curve", () => {
    const curve = [
      { bar: 0, bpm: 120 },
      { bar: 64, bpm: 128 },
    ];
    expect(bpmAtBar(curve, 0)).toBe(120);
    expect(bpmAtBar(curve, 64)).toBe(128);
    expect(bpmAtBar(curve, 32)).toBeCloseTo(124, 5); // midpoint
    expect(bpmAtBar(curve, 999)).toBe(128); // clamps past the end
  });

  it("quantizes to phrase boundaries and computes the safe edit floor", () => {
    expect(quantizeToPhrase(1)).toBe(4);
    expect(quantizeToPhrase(4)).toBe(4);
    expect(quantizeToPhrase(5)).toBe(8);
    // nowBar 10 + lookahead 24 = 34 → next phrase = 36
    expect(nextSafeEditBar(10)).toBe(36);
    // the floor is always a multiple of the phrase length
    expect(nextSafeEditBar(7) % 4).toBe(0);
  });

  it("advances the bar clock forward over real seconds", () => {
    // at 120 BPM, one bar = 2s. 4s should advance ~2 bars from 0.
    const after = advanceBar(0, 4, [{ bar: 0, bpm: 120 }], 64);
    expect(after).toBeCloseTo(2, 1);
    // never overshoots the set length
    expect(advanceBar(63, 100, [{ bar: 0, bpm: 120 }], 64)).toBe(64);
    // zero elapsed = no movement
    expect(advanceBar(10, 0, [{ bar: 0, bpm: 120 }], 64)).toBe(10);
  });
});

describe("tempoMatchRatio (beatmatch)", () => {
  it("is outgoing/incoming and slows a faster incoming track", () => {
    // set running at 120, incoming track is 126 → must slow to 120/126 (<1).
    expect(tempoMatchRatio(120, 126)).toBeCloseTo(120 / 126, 5);
    expect(tempoMatchRatio(120, 126)).toBeLessThan(1);
    // speed up a slower incoming track
    expect(tempoMatchRatio(128, 120)).toBeGreaterThan(1);
    // identical tempo = no stretch
    expect(tempoMatchRatio(124, 124)).toBe(1);
  });

  it("guards against zero / NaN and clamps to a sane DJ range", () => {
    expect(tempoMatchRatio(120, 0)).toBe(1);
    expect(tempoMatchRatio(NaN, 120)).toBe(1);
    // a wildly wrong estimate (half-time) is clamped, never extreme.
    const r = tempoMatchRatio(120, 60);
    expect(r).toBeLessThanOrEqual(1.6);
    expect(r).toBeGreaterThanOrEqual(0.6);
  });
});

describe("transitions", () => {
  it("constant-power crossfade preserves power across the blend", () => {
    const mid = constantPower(0.5);
    // equal-power: from^2 + to^2 ~= 1 at all points
    expect(mid.from * mid.from + mid.to * mid.to).toBeCloseTo(1, 5);
    expect(constantPower(0).from).toBeCloseTo(1, 5);
    expect(constantPower(1).to).toBeCloseTo(1, 5);
  });

  it("cut flips hard at the downbeat", () => {
    const before = transitionTargets(makeSheet().transitions[0], 0.2, 57).from;
    const cutT = { ...makeSheet().transitions[0], type: "cut" as const };
    expect(transitionTargets(cutT, 0.2, 57).from.gain).toBe(1);
    expect(transitionTargets(cutT, 0.2, 57).to.gain).toBe(0);
    expect(transitionTargets(cutT, 0.8, 63).from.gain).toBe(0);
    expect(transitionTargets(cutT, 0.8, 63).to.gain).toBe(1);
    // (the bass_swap `before` is just here to prove both types resolve)
    expect(before.gain).toBeGreaterThan(0);
  });

  it("bass_swap moves the sub from outgoing to incoming at swap_at_bar", () => {
    const tr = makeSheet().transitions[0]; // swap_at_bar = 60
    // before the swap: outgoing keeps lows, incoming is cut
    const pre = transitionTargets(tr, 0.3, 58);
    expect(pre.from.lowDb).toBe(0);
    expect(pre.to.lowDb).toBeLessThan(0);
    // after the swap: it flips
    const post = transitionTargets(tr, 0.6, 61);
    expect(post.from.lowDb).toBeLessThan(0);
    expect(post.to.lowDb).toBe(0);
  });

  it("filter_fade sweeps the outgoing high-pass up over the blend", () => {
    const tr = { ...makeSheet().transitions[0], type: "filter_fade" as const };
    const early = transitionTargets(tr, 0.1, 57).from.highpassHz;
    const late = transitionTargets(tr, 0.9, 63).from.highpassHz;
    expect(late).toBeGreaterThan(early); // thinning out the outgoing
  });
});

describe("cueExecutor.resolveFrame", () => {
  const knownBpm = (id: string): number | undefined =>
    id === "lib:aaa" ? 124 : id === "lib:bbb" ? 126 : undefined;

  it("emits a StateReport with the bar clock + bpm + buffer ahead", () => {
    const sheet = makeSheet();
    const { report } = resolveFrame(sheet, 20, knownBpm);
    expect(report.now_bar).toBe(20);
    expect(report.now_bpm).toBeCloseTo(122.5, 1); // 120→128 over 0..64, at bar 20
    expect(report.plan_version_running).toBe(1);
    expect(report.buffer_planned_until_bar).toBeGreaterThan(report.now_bar);
    expect(report.next_safe_edit_bar % 4).toBe(0);
  });

  it("puts the opening track on deck A and beatmatches it", () => {
    const sheet = makeSheet();
    const frame = resolveFrame(sheet, 10, knownBpm);
    const deckA = frame.decks.find((d) => d.slot === 1);
    expect(deckA?.cue?.track_id).toBe("lib:aaa");
    expect(deckA?.state).toBe("playing");
    // beatmatch: nowBpm(~121.25) / trackBpm(124) → slightly below 1
    expect(deckA?.playbackRate).toBeCloseTo(bpmAtBar(sheet.global.tempo_curve, 10) / 124, 4);
  });

  it("reports the active transition only inside its window", () => {
    const sheet = makeSheet(); // transition t1 at 56..64
    expect(activeTransitionAt(sheet, 40)).toBeNull();
    expect(activeTransitionAt(sheet, 58)?.id).toBe("t1");
    expect(resolveFrame(sheet, 58, knownBpm).report.active_transition).toBe("t1");
    expect(resolveFrame(sheet, 40, knownBpm).report.active_transition).toBeNull();
  });

  it("falls back to the cue sheet bpm when a track isn't decoded yet", () => {
    const sheet = makeSheet();
    // unknown bpm for both → use cue.bpm (124) for deck A
    const frame = resolveFrame(sheet, 10, () => undefined);
    const deckA = frame.decks.find((d) => d.slot === 1);
    const expected = bpmAtBar(sheet.global.tempo_curve, 10) / 124;
    expect(deckA?.playbackRate).toBeCloseTo(expected, 4);
  });

  it("advancing the clock makes now_bar increase across frames", () => {
    const sheet = makeSheet();
    let bar = 0;
    const reports: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      bar = advanceBar(bar, 1, sheet.global.tempo_curve, 200);
      reports.push(resolveFrame(sheet, bar, knownBpm).report.now_bar);
    }
    // strictly increasing
    for (let i = 1; i < reports.length; i += 1) {
      expect(reports[i]).toBeGreaterThan(reports[i - 1]);
    }
  });
});

describe("applyReplanFreeze (near-live re-plan)", () => {
  it("freezes the past and adopts only the tail of the new plan", () => {
    const current = makeSheet(1);
    // a v2 that tries to rewrite EVERYTHING (including bar 0) ...
    const next: CueSheet = {
      ...makeSheet(2, 64),
      tracks: [
        // illegal edit to the playing track (bar 0) — must be ignored
        { ...makeSheet().tracks[0], track_id: "lib:HACK", play_in_bar: 0 },
        // legal future track at bar 64
        { ...makeSheet().tracks[1], track_id: "lib:ccc", play_in_bar: 64 },
      ],
      transitions: [],
    };
    const freezeBar = 64;
    const merged = applyReplanFreeze(current, next, freezeBar);

    // the playing track is preserved from `current`, NOT overwritten by the edit
    const atZero = merged.tracks.find((t) => t.play_in_bar === 0);
    expect(atZero?.track_id).toBe("lib:aaa");
    // the future track comes from `next`
    const future = merged.tracks.find((t) => t.play_in_bar === 64);
    expect(future?.track_id).toBe("lib:ccc");
    // version bumped, valid_from_bar set to the freeze line
    expect(merged.version).toBe(2);
    expect(merged.valid_from_bar).toBe(64);
  });

  it("never lets a re-plan rewrite a bar below the freeze line", () => {
    const current = makeSheet(1);
    const next = makeSheet(2, 32);
    const merged = applyReplanFreeze(current, next, 32);
    // no track from `next` with play_in_bar < 32 leaks in
    for (const t of merged.tracks) {
      if (t.play_in_bar < 32) {
        // must have come from current (same ids as current's <32 tracks)
        expect(current.tracks.some((c) => c.play_in_bar === t.play_in_bar)).toBe(true);
      }
    }
  });
});
