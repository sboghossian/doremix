import type {
  Brief,
  CamelotKey,
  CueSheet,
  CueTrack,
  CueTransition,
  EnergyArc,
  EnergyPoint,
  StateReport,
  TempoPoint,
  Track,
  TransitionType,
} from "@/types";
import { clamp, shortId } from "@/lib/util";
import type { Conductor } from "./Conductor";

/** ~4 bars of a typical track is one phrase; we plan one track ≈ 64 bars. */
const BARS_PER_TRACK = 64;
const TRANSITION_BARS = 8;
/** rough minutes a 64-bar segment at ~124bpm occupies (used to size the set). */
const MIN_PER_SEGMENT = 2.0;

const TRANSITION_MENU: TransitionType[] = [
  "bass_swap",
  "filter_fade",
  "echo_out",
  "loop_roll",
  "cut",
];

function camelotNumber(key: CamelotKey): number {
  return parseInt(key, 10);
}

/** Camelot-adjacency distance (wheel of 12, A/B inner/outer). Lower = smoother. */
function harmonicDistance(a: CamelotKey, b: CamelotKey): number {
  const na = camelotNumber(a);
  const nb = camelotNumber(b);
  const ringDelta = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
  const sameLetter = a.slice(-1) === b.slice(-1);
  return ringDelta + (sameLetter ? 0 : 0.5);
}

/** Target energy shape across the set, normalized 0..1 over progress 0..1. */
function arcShape(arc: EnergyArc, t: number): number {
  switch (arc) {
    case "rising":
      return clamp(0.32 + 0.6 * t, 0, 1);
    case "wave":
      return clamp(0.45 + 0.4 * Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.2 * t, 0, 1);
    case "plateau_peak":
      // build, hold, peak near 0.8, release
      if (t < 0.55) return clamp(0.35 + 0.45 * (t / 0.55), 0, 1);
      if (t < 0.8) return clamp(0.8 + 0.15 * ((t - 0.55) / 0.25), 0, 1);
      return clamp(0.95 - 0.45 * ((t - 0.8) / 0.2), 0, 1);
  }
}

function pickTransition(seedIndex: number, energyDelta: number): TransitionType {
  // higher energy jumps → bass_swap / cut; gentle moves → filter_fade / echo_out
  if (energyDelta > 0.18) return seedIndex % 2 === 0 ? "bass_swap" : "cut";
  if (energyDelta < -0.12) return "echo_out";
  return TRANSITION_MENU[seedIndex % 3];
}

interface OrderResult {
  ordered: Track[];
  segments: number;
}

/** Greedy harmonic ordering that also tracks the desired energy arc. */
function orderTracks(
  library: Track[],
  brief: Brief,
  segments: number,
  startTrack?: Track,
): OrderResult {
  const pool = library.filter((t) => t.analyzed);
  if (pool.length === 0) return { ordered: [], segments: 0 };

  const peakAt = brief.arc === "plateau_peak" ? 0.7 : brief.arc === "wave" ? 0.5 : 0.92;
  const used = new Set<string>();
  const ordered: Track[] = [];

  let current =
    startTrack ??
    [...pool].sort((a, b) => a.energy - b.energy)[0]; // open low
  ordered.push(current);
  used.add(current.id);

  for (let i = 1; i < segments; i += 1) {
    const progress = i / Math.max(1, segments - 1);
    const wantEnergy = arcShape(brief.arc, progress);
    const afterPeak = progress > peakAt;

    let best: Track | null = null;
    let bestScore = Infinity;
    for (const cand of pool) {
      if (used.has(cand.id)) continue;
      if (brief.rules.noVocalsAfterPeak && afterPeak && cand.hasVocals) continue;
      const harm = brief.rules.harmonicOnly
        ? harmonicDistance(current.key, cand.key) * 1.4
        : harmonicDistance(current.key, cand.key) * 0.5;
      const energyFit = Math.abs(cand.energy - wantEnergy) * 2.2;
      const bpmFit = Math.abs(cand.bpm - current.bpm) * 0.06;
      const score = harm + energyFit + bpmFit;
      if (score < bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    // if a rule starved the pool, relax it rather than stall (engine never stalls)
    if (!best) {
      for (const cand of pool) {
        if (used.has(cand.id)) continue;
        best = cand;
        break;
      }
    }
    if (!best) {
      // wrap: reuse from the start of the library to keep the set going
      best = pool[i % pool.length];
    }
    ordered.push(best);
    used.add(best.id);
    current = best;
  }

  return { ordered, segments };
}

function buildCueSheet(
  brief: Brief,
  ordered: Track[],
  opts: { version: number; planId: string; validFromBar: number; baseBar: number },
): CueSheet {
  const tracks: CueTrack[] = [];
  const transitions: CueTransition[] = [];
  const energyPoints: EnergyPoint[] = [];
  const tempoPoints: TempoPoint[] = [];

  ordered.forEach((tr, i) => {
    const playInBar = opts.baseBar + i * BARS_PER_TRACK;
    tracks.push({
      deck_slot: i % 2 === 0 ? 1 : 2,
      track_id: tr.id,
      bpm: tr.bpm,
      key: tr.key,
      downbeat_offset_ms: Math.round((tr.energy * 73) % 60),
      play_in_bar: playInBar,
      cue_in_bar: 16,
      cue_out_bar: 16 + BARS_PER_TRACK,
      section_labels: [
        { bar: playInBar + 16, label: "verse" },
        { bar: playInBar + 48, label: tr.energy > 0.7 ? "peak" : "drop" },
      ],
    });

    const progress = ordered.length > 1 ? i / (ordered.length - 1) : 0;
    energyPoints.push({
      bar: playInBar + 32,
      energy: clamp((arcShape(brief.arc, progress) + tr.energy) / 2, 0.05, 1),
    });
    tempoPoints.push({ bar: playInBar, bpm: tr.bpm });

    if (i > 0) {
      const prev = ordered[i - 1];
      const startBar = playInBar - TRANSITION_BARS;
      const energyDelta = tr.energy - prev.energy;
      transitions.push({
        id: shortId("t"),
        from_deck: (i - 1) % 2 === 0 ? 1 : 2,
        to_deck: i % 2 === 0 ? 1 : 2,
        type: pickTransition(i, energyDelta),
        start_bar: startBar,
        duration_bars: brief.rules.longBlends ? 16 : TRANSITION_BARS,
        params: { eq_curve: "log", swap_at_bar: playInBar },
      });
    }
  });

  return {
    plan_id: opts.planId,
    version: opts.version,
    valid_from_bar: opts.validFromBar,
    global: {
      tempo_curve: tempoPoints,
      energy_curve: energyPoints,
      key_policy: brief.rules.harmonicOnly ? "harmonic" : "free",
    },
    tracks,
    transitions,
    stem_ops: [],
  };
}

/** Bias the brief's arc/rules from a re-steer phrase (very light NLU). */
function applyReprompt(text: string, brief: Brief): Brief {
  const t = text.toLowerCase();
  const next: Brief = { ...brief, rules: { ...brief.rules } };
  if (/(build|raise|harder|peak|energy|hype|drop now|double)/.test(t)) {
    next.arc = "rising";
  }
  if (/(cool|chill|cool it|down|release|breathe|easy)/.test(t)) {
    next.arc = "wave";
  }
  if (/(instrumental|no vocals)/.test(t)) {
    next.rules.noVocalsAfterPeak = true;
  }
  if (/(more vocals|vocal)/.test(t)) {
    next.rules.noVocalsAfterPeak = false;
  }
  if (/(extend|longer|stretch)/.test(t)) {
    next.lengthMin = brief.lengthMin + 8;
  }
  return next;
}

export class MockConductor implements Conductor {
  private lastBrief: Brief | null = null;
  private lastLibrary: Track[] = [];

  planSet(brief: Brief, library: Track[]): CueSheet {
    this.lastBrief = brief;
    this.lastLibrary = library;

    const segments = clamp(
      Math.round(brief.lengthMin / MIN_PER_SEGMENT),
      3,
      Math.max(3, library.filter((t) => t.analyzed).length + 4),
    );
    const { ordered } = orderTracks(library, brief, segments);

    return buildCueSheet(brief, ordered, {
      version: 1,
      planId: `set-${new Date().toISOString().slice(0, 16)}Z`,
      validFromBar: 0,
      baseBar: 0,
    });
  }

  reprompt(text: string, state: StateReport, current: CueSheet): CueSheet {
    const brief = this.lastBrief
      ? applyReprompt(text, this.lastBrief)
      : applyReprompt(text, {
          text,
          lengthMin: 40,
          audience: "peak_club",
          arc: "rising",
          rules: {
            noVocalsAfterPeak: false,
            harmonicOnly: true,
            noDoubleDrops: false,
            longBlends: false,
          },
        });
    this.lastBrief = brief;

    const safe = state.next_safe_edit_bar;

    // FROZEN: everything strictly before safe stays byte-for-byte.
    const frozenTracks = current.tracks.filter((t) => t.play_in_bar < safe);
    const frozenTransitions = current.transitions.filter((t) => t.start_bar < safe);
    const frozenEnergy = current.global.energy_curve.filter((p) => p.bar < safe);
    const frozenTempo = current.global.tempo_curve.filter((p) => p.bar < safe);

    // Re-plan the tail from the safe edit bar with the biased brief.
    const lastFrozenTrackId =
      frozenTracks.length > 0 ? frozenTracks[frozenTracks.length - 1].track_id : undefined;
    const startTrack = this.lastLibrary.find((t) => t.id === lastFrozenTrackId);

    const remainingSegments = clamp(
      Math.round(state.time_remaining_in_set_bars / BARS_PER_TRACK) + 1,
      2,
      this.lastLibrary.filter((t) => t.analyzed).length + 3,
    );

    const { ordered } = orderTracks(this.lastLibrary, brief, remainingSegments, startTrack);
    // drop the first (it's the already-playing/frozen track we anchored on)
    const tailTracks = startTrack ? ordered.slice(1) : ordered;

    const tail = buildCueSheet(brief, tailTracks, {
      version: current.version + 1,
      planId: current.plan_id,
      validFromBar: safe,
      baseBar: Math.ceil(safe / BARS_PER_TRACK) * BARS_PER_TRACK,
    });

    return {
      plan_id: current.plan_id,
      version: current.version + 1,
      valid_from_bar: safe,
      global: {
        key_policy: brief.rules.harmonicOnly ? "harmonic" : "free",
        tempo_curve: [...frozenTempo, ...tail.global.tempo_curve],
        energy_curve: [...frozenEnergy, ...tail.global.energy_curve],
      },
      tracks: [...frozenTracks, ...tail.tracks],
      transitions: [...frozenTransitions, ...tail.transitions],
      stem_ops: [],
    };
  }
}
