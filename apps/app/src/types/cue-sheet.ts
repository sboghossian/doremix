/**
 * Types mirroring docs/CUE-SHEET-SPEC.md — the contract between the Conductor
 * (LLM) and the Engine. Time is in BARS, not seconds. Versioned + frozen-floor.
 *
 * These types are the product. The MockConductor emits them; the MockEngine
 * consumes them and reports state back. When the real engine/conductor land,
 * they speak this exact shape.
 */

/** Camelot wheel key, e.g. "8A", "12B". */
export type CamelotKey = `${number}${"A" | "B"}`;

export type TransitionType =
  | "cut"
  | "filter_fade"
  | "bass_swap"
  | "echo_out"
  | "loop_roll";

export interface CurvePoint {
  bar: number;
  /** present on energy_curve points */
  energy?: number;
  /** present on tempo_curve points */
  bpm?: number;
}

export interface TempoPoint {
  bar: number;
  bpm: number;
}

export interface EnergyPoint {
  bar: number;
  energy: number;
}

export type KeyPolicy = "harmonic" | "free";

export interface CueGlobal {
  tempo_curve: TempoPoint[];
  energy_curve: EnergyPoint[];
  key_policy: KeyPolicy;
}

export interface SectionLabel {
  bar: number;
  label: string;
}

export interface CueTrack {
  /** 1 or 2 — which deck this track is staged on */
  deck_slot: 1 | 2;
  /** stable library id, e.g. "lib:8a31f" */
  track_id: string;
  bpm: number;
  key: CamelotKey;
  downbeat_offset_ms?: number;
  play_in_bar: number;
  cue_in_bar: number;
  cue_out_bar: number;
  section_labels?: SectionLabel[];
}

export interface TransitionParams {
  eq_curve?: "log" | "linear";
  swap_at_bar?: number;
}

export interface CueTransition {
  id: string;
  from_deck: 1 | 2;
  to_deck: 1 | 2;
  type: TransitionType;
  start_bar: number;
  duration_bars: number;
  params?: TransitionParams;
}

export type StemName = "vocals" | "drums" | "bass" | "other";
export type StemAction = "mute" | "solo_in" | "unmute" | "duck";

export interface StemOp {
  deck: 1 | 2;
  stem: StemName;
  action: StemAction;
  at_bar: number;
  ramp_bars: number;
}

/** Conductor → Engine. */
export interface CueSheet {
  plan_id: string;
  version: number;
  /** everything below this bar is FROZEN (committed/playing) */
  valid_from_bar: number;
  global: CueGlobal;
  tracks: CueTrack[];
  transitions: CueTransition[];
  /** v1 stem engine; ignored in v0 */
  stem_ops?: StemOp[];
}

export type DeckState = "playing" | "cued" | "idle" | "ending";

export interface DeckReport {
  slot: 1 | 2;
  track_id: string;
  state: DeckState;
  track_bar: number;
  active_stems?: StemName[];
}

/** Engine → Conductor. */
export interface StateReport {
  now_bar: number;
  now_bpm: number;
  plan_version_running: number;
  decks: DeckReport[];
  active_transition: string | null;
  time_remaining_in_set_bars: number;
  next_safe_edit_bar: number;
  buffer_planned_until_bar: number;
}
