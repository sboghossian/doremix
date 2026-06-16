/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CUE-SHEET SCHEMA — parse · validate · repair.   (pure, no network)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The LLM emits free JSON; the Engine needs a CueSheet that obeys
 * docs/CUE-SHEET-SPEC.md exactly. This module is the airlock:
 *
 *   parseCueSheet(raw, ctx)  →  { ok, sheet, errors, repaired }
 *
 * Strategy (in order):
 *   1. Pull a JSON object out of the model text (handles ```json fences, a
 *      `{ message, cue_sheet }` envelope, or a bare object).
 *   2. Coerce/clamp obvious issues: numbers-as-strings, out-of-range energy,
 *      bad deck slots, missing optional fields, unsorted tracks.
 *   3. Enforce HARD invariants: every track_id exists in the library; ≥1 valid
 *      track survives; transitions reference real decks; harmonic policy when
 *      requested. Drop offending rows; if nothing valid remains → not ok.
 *
 * `ok:false` is the caller's signal to re-ask once or fall back to the
 * heuristic. Nothing here throws.
 */

import type {
  CamelotKey,
  CueGlobal,
  CueSheet,
  CueTrack,
  CueTransition,
  EnergyPoint,
  KeyPolicy,
  SectionLabel,
  StemAction,
  StemName,
  StemOp,
  TempoPoint,
  TransitionParams,
  TransitionType,
} from "@/types";
import { harmonicDistance } from "./heuristic";

const TRANSITION_TYPES: readonly TransitionType[] = [
  "cut",
  "filter_fade",
  "bass_swap",
  "echo_out",
  "loop_roll",
];
const STEM_NAMES: readonly StemName[] = ["vocals", "drums", "bass", "other"];
const STEM_ACTIONS: readonly StemAction[] = ["mute", "solo_in", "unmute", "duck"];

export interface ValidationContext {
  /** valid library track ids (and their canonical bpm/key for repair) */
  tracks: { id: string; bpm: number; key: CamelotKey }[];
  /** require Camelot-adjacent moves when the brief asked for it */
  harmonicOnly: boolean;
  /** the version this sheet should carry (e.g. 1 for a fresh plan) */
  expectVersion?: number;
  /** floor: tracks/transitions below this bar are dropped (live re-plan) */
  validFromBar?: number;
}

export interface ParseResult {
  ok: boolean;
  /** present iff ok — a CueSheet that satisfies the contract */
  sheet: CueSheet | null;
  /** the model's natural-language line, if it returned a `{message,cue_sheet}` envelope */
  message: string | null;
  /** human-readable issues found (used to re-ask the model on repair) */
  errors: string[];
  /** true if we coerced/clamped/dropped anything to make it valid */
  repaired: boolean;
}

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** number | "123" | "123.4bpm" → number, else undefined. */
function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.match(/-?\d+(\.\d+)?/);
    if (m) {
      const n = Number(m[0]);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Normalize a key into a Camelot token ("8a" → "8A"); undefined if hopeless. */
function camelot(v: unknown): CamelotKey | undefined {
  if (typeof v !== "string") return undefined;
  const m = v.trim().toUpperCase().match(/^(\d{1,2})\s*([AB])$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (n < 1 || n > 12) return undefined;
  return `${n}${m[2] as "A" | "B"}` as CamelotKey;
}

function deck(v: unknown): 1 | 2 | undefined {
  const n = num(v);
  return n === 1 ? 1 : n === 2 ? 2 : undefined;
}

/**
 * Extract the first balanced JSON object from arbitrary model text. Handles
 * ```json fences and leading/trailing prose. Returns the parsed object or null.
 */
export function extractJson(raw: string): Json | null {
  if (!raw) return null;
  // strip code fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;

  // fast path: whole thing is JSON
  const direct = tryParse(candidate.trim());
  if (direct) return direct;

  // scan for the first balanced { … }
  const start = candidate.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1);
        return tryParse(slice);
      }
    }
  }
  return null;
}

function tryParse(s: string): Json | null {
  try {
    const v: unknown = JSON.parse(s);
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

function repairTrack(
  raw: unknown,
  byId: Map<string, { bpm: number; key: CamelotKey }>,
  errors: string[],
  index: number,
): { track: CueTrack; repaired: boolean } | null {
  if (!isObj(raw)) {
    errors.push("track entry was not an object");
    return null;
  }
  const id = typeof raw.track_id === "string" ? raw.track_id : undefined;
  if (!id || !byId.has(id)) {
    errors.push(`track_id "${String(raw.track_id)}" not in library`);
    return null;
  }
  const canon = byId.get(id)!;
  let repaired = false;

  let slot = deck(raw.deck_slot);
  if (slot === undefined) {
    // a real cue sheet alternates decks; fall back to that, not a constant 1
    slot = index % 2 === 0 ? 1 : 2;
    repaired = true;
  }

  let bpm = num(raw.bpm);
  if (bpm === undefined || bpm < 60 || bpm > 220) {
    bpm = canon.bpm;
    repaired = true;
  }

  let key = camelot(raw.key);
  if (key === undefined) {
    key = canon.key;
    repaired = true;
  }

  let playIn = num(raw.play_in_bar);
  if (playIn === undefined || playIn < 0) {
    playIn = 0;
    repaired = true;
  }
  playIn = Math.round(playIn);

  let cueIn = num(raw.cue_in_bar);
  if (cueIn === undefined || cueIn < 0) {
    cueIn = 0;
    repaired = true;
  }
  let cueOut = num(raw.cue_out_bar);
  if (cueOut === undefined || cueOut <= cueIn) {
    cueOut = cueIn + 64;
    repaired = true;
  }

  const track: CueTrack = {
    deck_slot: slot,
    track_id: id,
    bpm: Math.round(bpm),
    key,
    play_in_bar: playIn,
    cue_in_bar: Math.round(cueIn),
    cue_out_bar: Math.round(cueOut),
  };

  const off = num(raw.downbeat_offset_ms);
  if (off !== undefined) track.downbeat_offset_ms = clamp(Math.round(off), 0, 2000);

  const labels = repairSectionLabels(raw.section_labels);
  if (labels) track.section_labels = labels;

  return { track, repaired };
}

function repairSectionLabels(raw: unknown): SectionLabel[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SectionLabel[] = [];
  for (const item of raw) {
    if (!isObj(item)) continue;
    const bar = num(item.bar);
    const label = typeof item.label === "string" ? item.label : undefined;
    if (bar === undefined || !label) continue;
    out.push({ bar: Math.round(bar), label });
  }
  return out.length > 0 ? out : undefined;
}

function repairTransition(
  raw: unknown,
  validSlots: Set<number>,
  errors: string[],
  idx: number,
): { transition: CueTransition; repaired: boolean } | null {
  if (!isObj(raw)) {
    errors.push("transition entry was not an object");
    return null;
  }
  let repaired = false;

  const from = deck(raw.from_deck);
  const to = deck(raw.to_deck);
  if (from === undefined || to === undefined) {
    errors.push("transition missing valid from_deck/to_deck");
    return null;
  }
  if (validSlots.size > 0 && (!validSlots.has(from) || !validSlots.has(to))) {
    errors.push(`transition references a deck not staged by any track (${from}→${to})`);
    return null;
  }

  let type = raw.type as TransitionType;
  if (!TRANSITION_TYPES.includes(type)) {
    type = "filter_fade";
    repaired = true;
  }

  let start = num(raw.start_bar);
  if (start === undefined || start < 0) {
    errors.push("transition missing start_bar");
    return null;
  }
  start = Math.round(start);

  let dur = num(raw.duration_bars);
  if (dur === undefined || dur <= 0) {
    dur = 8;
    repaired = true;
  }
  dur = clamp(Math.round(dur), 1, 64);

  const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : `t${idx + 1}`;

  const transition: CueTransition = {
    id,
    from_deck: from,
    to_deck: to,
    type,
    start_bar: start,
    duration_bars: dur,
  };

  const params = repairParams(raw.params);
  if (params) transition.params = params;

  return { transition, repaired };
}

function repairParams(raw: unknown): TransitionParams | undefined {
  if (!isObj(raw)) return undefined;
  const out: TransitionParams = {};
  if (raw.eq_curve === "log" || raw.eq_curve === "linear") out.eq_curve = raw.eq_curve;
  const swap = num(raw.swap_at_bar);
  if (swap !== undefined) out.swap_at_bar = Math.round(swap);
  return Object.keys(out).length > 0 ? out : undefined;
}

function repairCurvePoints<K extends "bpm" | "energy">(
  raw: unknown,
  field: K,
): (K extends "bpm" ? TempoPoint : EnergyPoint)[] {
  if (!Array.isArray(raw)) return [];
  const out: { bar: number; bpm?: number; energy?: number }[] = [];
  for (const item of raw) {
    if (!isObj(item)) continue;
    const bar = num(item.bar);
    const val = num(item[field]);
    if (bar === undefined || val === undefined) continue;
    if (field === "bpm") {
      out.push({ bar: Math.round(bar), bpm: clamp(val, 60, 220) });
    } else {
      out.push({ bar: Math.round(bar), energy: clamp(val, 0, 1) });
    }
  }
  out.sort((a, b) => a.bar - b.bar);
  return out as (K extends "bpm" ? TempoPoint : EnergyPoint)[];
}

function repairStemOps(raw: unknown): StemOp[] {
  if (!Array.isArray(raw)) return [];
  const out: StemOp[] = [];
  for (const item of raw) {
    if (!isObj(item)) continue;
    const d = deck(item.deck);
    const stem = item.stem as StemName;
    const action = item.action as StemAction;
    const at = num(item.at_bar);
    const ramp = num(item.ramp_bars);
    if (d === undefined || !STEM_NAMES.includes(stem) || !STEM_ACTIONS.includes(action)) continue;
    if (at === undefined) continue;
    out.push({
      deck: d,
      stem,
      action,
      at_bar: Math.round(at),
      ramp_bars: ramp !== undefined ? clamp(Math.round(ramp), 0, 32) : 2,
    });
  }
  return out;
}

/**
 * Validate + repair a raw LLM cue-sheet object (or a `{message,cue_sheet}`
 * envelope) against the contract. Returns `ok:false` when nothing valid
 * survives, so the caller can re-ask or fall back.
 */
export function validateCueSheet(rawInput: unknown, ctx: ValidationContext): ParseResult {
  const errors: string[] = [];
  let repaired = false;

  if (!isObj(rawInput)) {
    return { ok: false, sheet: null, message: null, errors: ["response was not a JSON object"], repaired: false };
  }

  // unwrap a { message, cue_sheet } envelope if present
  let message: string | null = null;
  let body: Json = rawInput;
  if (typeof rawInput.message === "string") message = rawInput.message.trim();
  if (isObj(rawInput.cue_sheet)) body = rawInput.cue_sheet;
  else if (isObj(rawInput.cueSheet)) body = rawInput.cueSheet;

  const byId = new Map(ctx.tracks.map((t) => [t.id, { bpm: t.bpm, key: t.key }]));
  const floor = ctx.validFromBar ?? 0;

  // tracks
  const rawTracks = Array.isArray(body.tracks) ? body.tracks : [];
  const tracks: CueTrack[] = [];
  rawTracks.forEach((rt, i) => {
    const res = repairTrack(rt, byId, errors, i);
    if (!res) {
      repaired = true; // dropping an invalid/ghost-id track is itself a repair
      return;
    }
    if (res.track.play_in_bar < floor) {
      repaired = true; // dropping a below-floor edit is itself a repair
      return;
    }
    if (res.repaired) repaired = true;
    tracks.push(res.track);
  });

  if (tracks.length === 0) {
    return {
      ok: false,
      sheet: null,
      message,
      errors: errors.length > 0 ? errors : ["no valid tracks in cue sheet"],
      repaired,
    };
  }

  // tracks must be ordered by play_in_bar
  const sorted = [...tracks].sort((a, b) => a.play_in_bar - b.play_in_bar);
  if (sorted.some((t, i) => t !== tracks[i])) repaired = true;

  // harmonic policy: flag (don't drop) non-adjacent moves when requested
  if (ctx.harmonicOnly) {
    for (let i = 1; i < sorted.length; i += 1) {
      if (harmonicDistance(sorted[i - 1].key, sorted[i].key) > 2.5) {
        errors.push(`harmonic policy: ${sorted[i - 1].key}→${sorted[i].key} is not Camelot-adjacent`);
        repaired = true; // tolerated, but reported so a re-ask can tighten it
      }
    }
  }

  const validSlots = new Set<number>(sorted.map((t) => t.deck_slot));

  // transitions
  const rawTransitions = Array.isArray(body.transitions) ? body.transitions : [];
  const transitions: CueTransition[] = [];
  rawTransitions.forEach((rt, i) => {
    const res = repairTransition(rt, validSlots, errors, i);
    if (!res) return;
    if (res.transition.start_bar < floor) {
      repaired = true;
      return;
    }
    if (res.repaired) repaired = true;
    transitions.push(res.transition);
  });
  transitions.sort((a, b) => a.start_bar - b.start_bar);

  // global
  const rawGlobal = isObj(body.global) ? body.global : {};
  let tempo = repairCurvePoints<"bpm">(rawGlobal.tempo_curve, "bpm").filter((p) => p.bar >= floor);
  let energy = repairCurvePoints<"energy">(rawGlobal.energy_curve, "energy").filter(
    (p) => p.bar >= floor,
  );
  // a sheet with tracks but no curves is playable but degraded — synthesize from tracks
  if (tempo.length === 0) {
    tempo = sorted.map((t) => ({ bar: t.play_in_bar, bpm: t.bpm }));
    repaired = true;
  }
  if (energy.length === 0) {
    energy = sorted.map((t, i) => ({
      bar: t.play_in_bar,
      energy: clamp(0.35 + (0.5 * i) / Math.max(1, sorted.length - 1), 0.05, 1),
    }));
    repaired = true;
  }
  const policy: KeyPolicy = ctx.harmonicOnly ? "harmonic" : rawGlobal.key_policy === "free" ? "free" : "harmonic";
  const global: CueGlobal = { tempo_curve: tempo, energy_curve: energy, key_policy: policy };

  // header
  const planId =
    typeof body.plan_id === "string" && body.plan_id.length > 0
      ? body.plan_id
      : `set-${new Date().toISOString().slice(0, 16)}Z`;
  let version = num(body.version);
  if (ctx.expectVersion !== undefined) {
    if (version !== ctx.expectVersion) repaired = true;
    version = ctx.expectVersion;
  } else if (version === undefined || version < 1) {
    version = 1;
    repaired = true;
  }

  const sheet: CueSheet = {
    plan_id: planId,
    version: Math.round(version),
    valid_from_bar: floor,
    global,
    tracks: sorted,
    transitions,
    stem_ops: repairStemOps(body.stem_ops),
  };

  return { ok: true, sheet, message, errors, repaired };
}

/**
 * Convenience: extract JSON from model text, then validate. Used by the
 * conductor; tests can call either layer.
 */
export function parseCueSheet(rawText: string, ctx: ValidationContext): ParseResult {
  const obj = extractJson(rawText);
  if (!obj) {
    return { ok: false, sheet: null, message: null, errors: ["could not find JSON in the model response"], repaired: false };
  }
  return validateCueSheet(obj, ctx);
}
