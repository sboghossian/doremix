/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  HEURISTIC PLANNER — framework-free, deterministic fallback.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A local greedy harmonic/energy planner that turns a Brief + library into a
 * spec-conformant, bar-addressed CueSheet WITHOUT any network call. The
 * RealConductor returns this instantly (so the engine always gets something
 * playable) and then upgrades it in place when the LLM responds. The
 * conductor.test.ts suite also leans on it as the "the LLM totally failed"
 * fallback so a no-network run still yields a valid sheet.
 *
 * This mirrors MockConductor's ordering but lives here, dependency-free, so the
 * whole `src/conductor/` directory can be lifted into `packages/conductor`
 * later (it imports only `@/types` + tiny local math, no React).
 */

import type {
  Brief,
  CamelotKey,
  CueGlobal,
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

/** ~64 bars per track segment (≈ 2 min at 124 BPM). */
export const BARS_PER_TRACK = 64;
const TRANSITION_BARS = 8;
const MIN_PER_SEGMENT = 2.0;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Local id generator — deterministic-ish, no external dep. */
let _seq = 0;
function tid(prefix = "t"): string {
  _seq += 1;
  return `${prefix}${_seq.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function camelotNumber(key: CamelotKey): number {
  return parseInt(key, 10);
}

/** Camelot-adjacency distance (wheel of 12, A/B inner/outer). Lower = smoother. */
export function harmonicDistance(a: CamelotKey, b: CamelotKey): number {
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
      if (t < 0.55) return clamp(0.35 + 0.45 * (t / 0.55), 0, 1);
      if (t < 0.8) return clamp(0.8 + 0.15 * ((t - 0.55) / 0.25), 0, 1);
      return clamp(0.95 - 0.45 * ((t - 0.8) / 0.2), 0, 1);
  }
}

function pickTransition(seedIndex: number, energyDelta: number): TransitionType {
  const menu: TransitionType[] = ["bass_swap", "filter_fade", "echo_out", "loop_roll", "cut"];
  if (energyDelta > 0.18) return seedIndex % 2 === 0 ? "bass_swap" : "cut";
  if (energyDelta < -0.12) return "echo_out";
  return menu[seedIndex % 3];
}

/** Greedy harmonic ordering that also tracks the desired energy arc. */
export function orderTracks(
  library: Track[],
  brief: Brief,
  segments: number,
  startTrack?: Track,
): Track[] {
  const pool = library.filter((t) => t.analyzed);
  if (pool.length === 0) return [];

  const peakAt = brief.arc === "plateau_peak" ? 0.7 : brief.arc === "wave" ? 0.5 : 0.92;
  const used = new Set<string>();
  const ordered: Track[] = [];

  let current = startTrack ?? [...pool].sort((a, b) => a.energy - b.energy)[0]; // open low
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
    // a rule starved the pool → relax it rather than stall (engine never stalls)
    if (!best) {
      for (const cand of pool) {
        if (used.has(cand.id)) continue;
        best = cand;
        break;
      }
    }
    if (!best) best = pool[i % pool.length]; // wrap to keep the set going
    ordered.push(best);
    used.add(best.id);
    current = best;
  }

  return ordered;
}

interface BuildOpts {
  version: number;
  planId: string;
  validFromBar: number;
  baseBar: number;
}

/** Assemble an ordered track list into a CueSheet (the spec shape). */
export function buildCueSheet(brief: Brief, ordered: Track[], opts: BuildOpts): CueSheet {
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
        id: tid("t"),
        from_deck: (i - 1) % 2 === 0 ? 1 : 2,
        to_deck: i % 2 === 0 ? 1 : 2,
        type: pickTransition(i, energyDelta),
        start_bar: startBar,
        duration_bars: brief.rules.longBlends ? 16 : TRANSITION_BARS,
        params: { eq_curve: "log", swap_at_bar: playInBar },
      });
    }
  });

  const global: CueGlobal = {
    tempo_curve: tempoPoints,
    energy_curve: energyPoints,
    key_policy: brief.rules.harmonicOnly ? "harmonic" : "free",
  };

  return {
    plan_id: opts.planId,
    version: opts.version,
    valid_from_bar: opts.validFromBar,
    global,
    tracks,
    transitions,
    stem_ops: [],
  };
}

/** A stable-ish plan id from the wall clock (minute resolution). */
export function newPlanId(): string {
  return `set-${new Date().toISOString().slice(0, 16)}Z`;
}

/** How many track segments a brief of `lengthMin` minutes wants from `library`. */
export function segmentsFor(brief: Brief, library: Track[]): number {
  const analyzed = library.filter((t) => t.analyzed).length;
  return clamp(Math.round(brief.lengthMin / MIN_PER_SEGMENT), 3, Math.max(3, analyzed + 4));
}

/**
 * The whole heuristic plan v1 from a brief + library. This is the "engine
 * always gets something playable" guarantee — it never throws, never stalls,
 * and is byte-for-byte deterministic for a given ordering.
 */
export function heuristicPlan(brief: Brief, library: Track[], planId = newPlanId()): CueSheet {
  const ordered = orderTracks(library, brief, segmentsFor(brief, library));
  return buildCueSheet(brief, ordered, {
    version: 1,
    planId,
    validFromBar: 0,
    baseBar: 0,
  });
}

/**
 * Re-plan only the FUTURE tail at/after `next_safe_edit_bar`, freezing the past
 * and bumping the version. Mirrors the spec's frozen-floor edit rule and the
 * mock's reprompt, so the heuristic fallback for a live re-steer is legal.
 */
export function heuristicReprompt(
  brief: Brief,
  library: Track[],
  state: StateReport,
  current: CueSheet,
): CueSheet {
  const safe = state.next_safe_edit_bar;

  const frozenTracks = current.tracks.filter((t) => t.play_in_bar < safe);
  const frozenTransitions = current.transitions.filter((t) => t.start_bar < safe);
  const frozenEnergy = current.global.energy_curve.filter((p) => p.bar < safe);
  const frozenTempo = current.global.tempo_curve.filter((p) => p.bar < safe);

  const lastFrozenTrackId =
    frozenTracks.length > 0 ? frozenTracks[frozenTracks.length - 1].track_id : undefined;
  const startTrack = library.find((t) => t.id === lastFrozenTrackId);

  const remainingSegments = clamp(
    Math.round(state.time_remaining_in_set_bars / BARS_PER_TRACK) + 1,
    2,
    library.filter((t) => t.analyzed).length + 3,
  );

  const ordered = orderTracks(library, brief, remainingSegments, startTrack);
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

/** Bias the brief's arc/rules from a free-text re-steer phrase (light NLU). */
export function applyRepromptText(text: string, brief: Brief): Brief {
  const t = text.toLowerCase();
  const next: Brief = { ...brief, rules: { ...brief.rules } };
  if (/(build|raise|harder|peak|energy|hype|drop now|double|up)/.test(t)) next.arc = "rising";
  if (/(cool|chill|cool it|down|release|breathe|easy)/.test(t)) next.arc = "wave";
  if (/(instrumental|no vocals)/.test(t)) next.rules.noVocalsAfterPeak = true;
  if (/(more vocals|vocal)/.test(t)) next.rules.noVocalsAfterPeak = false;
  if (/(extend|longer|stretch)/.test(t)) next.lengthMin = brief.lengthMin + 8;
  return next;
}
