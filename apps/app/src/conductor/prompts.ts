/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  PROMPTS — system + user prompt builders for the OpenRouter conductor.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The model is asked to act as a DJ conductor and emit a single JSON object:
 *
 *   { "message": "<one short DJ line>", "cue_sheet": <CueSheet> }
 *
 * so one round-trip gives us BOTH the natural-language reply (vibe chat) and the
 * machine artifact (the engine plays it). The cue sheet must obey
 * docs/CUE-SHEET-SPEC.md: bar-addressed, versioned, frozen-floor, typed
 * transitions, harmonic policy. schema.ts validates + repairs whatever comes
 * back, so the prompt optimizes for "close enough to repair", not perfection.
 */

import type { Brief, CueSheet, StateReport, Track } from "@/types";

/** Compact, token-frugal view of a library track for the prompt. */
interface CompactTrack {
  track_id: string;
  title: string;
  artist: string;
  bpm: number;
  key: string;
  energy: number;
  duration: number;
  vocals: boolean;
}

function compactLibrary(library: Track[]): CompactTrack[] {
  return library
    .filter((t) => t.analyzed)
    .map((t) => ({
      track_id: t.id,
      title: t.title,
      artist: t.artist,
      bpm: t.bpm,
      key: t.key,
      energy: Math.round(t.energy * 100) / 100,
      duration: Math.round(t.duration),
      vocals: t.hasVocals,
    }));
}

function rulesLines(brief: Brief): string {
  const r = brief.rules;
  const lines: string[] = [];
  lines.push(`- harmonic_policy: ${r.harmonicOnly ? "harmonic (Camelot-adjacent moves only: ±1 on the number, or A/B swap)" : "free (any key move allowed)"}`);
  if (r.noVocalsAfterPeak) lines.push("- no vocal tracks after the energy peak");
  if (r.noDoubleDrops) lines.push("- never stack two drops at once (no double-drops)");
  if (r.longBlends) lines.push("- prefer long 16-bar blends over quick cuts");
  return lines.join("\n");
}

/** The contract reminder shared by every conductor prompt. */
const SCHEMA_REMINDER = `Return ONE JSON object, nothing else, of the form:
{
  "message": "<one short DJ line, max ~16 words, present tense>",
  "cue_sheet": {
    "plan_id": "<string>",
    "version": <int>,
    "valid_from_bar": <int, everything below is FROZEN>,
    "global": {
      "tempo_curve":  [ {"bar":0,"bpm":122}, ... ],
      "energy_curve": [ {"bar":0,"energy":0.4}, ... ],   // energy 0..1
      "key_policy": "harmonic" | "free"
    },
    "tracks": [
      { "deck_slot": 1|2, "track_id": "<MUST be one of the library ids>",
        "bpm": <int>, "key": "<Camelot e.g. 8A>",
        "play_in_bar": <int>, "cue_in_bar": <int>, "cue_out_bar": <int>,
        "section_labels": [ {"bar":<int>,"label":"verse|drop|peak|break"} ] }
    ],
    "transitions": [
      { "id": "t1", "from_deck": 1|2, "to_deck": 1|2,
        "type": "cut"|"filter_fade"|"bass_swap"|"echo_out"|"loop_roll",
        "start_bar": <int>, "duration_bars": <int>,
        "params": { "eq_curve": "log"|"linear", "swap_at_bar": <int> } }
    ]
  }
}

HARD RULES:
- Time is in BARS (4 beats each), never seconds. The set is a sequence of tracks ~64 bars apart.
- Every "track_id" MUST be copied verbatim from the provided library. Never invent ids.
- Tracks ordered by ascending play_in_bar. One transition lands just before each new track's play_in_bar.
- Shape the energy_curve to the requested arc. Open lower, peak where asked, resolve at the end.
- Output ONLY the JSON object. No prose, no markdown fences.`;

const SYSTEM = `You are Doremix's Conductor: a world-class DJ who plans a continuous, harmonically-mixed set from a crate of tracks.
You think musically (phrases, energy arc, key compatibility on the Camelot wheel, tasteful transition choices) and emit a precise, bar-addressed cue sheet that a deterministic audio engine executes.
You are concise. You never explain your reasoning in prose — the cue sheet IS the explanation. The "message" field is your single spoken line to the operator.`;

export function systemPrompt(): string {
  return SYSTEM;
}

/** Build the user prompt for a fresh plan (cue sheet v1). */
export function planUserPrompt(brief: Brief, library: Track[]): string {
  const lib = compactLibrary(library);
  return `JOB: plan a fresh DJ set (cue sheet version 1, valid_from_bar 0).

BRIEF
- length: ${brief.lengthMin} minutes (≈ ${Math.round((brief.lengthMin * 60) / 30)} tracks at ~2 min each, your call)
- audience / setting: ${brief.audience}
- energy arc: ${brief.arc}
- free-text: ${brief.text.trim() || "(none given)"}

RULES
${rulesLines(brief)}

LIBRARY (use ONLY these track_ids)
${JSON.stringify(lib)}

${SCHEMA_REMINDER}`;
}

/** Build the user prompt for a live re-steer (re-plan the tail only). */
export function repromptUserPrompt(
  text: string,
  state: StateReport,
  current: CueSheet,
  brief: Brief,
  library: Track[],
): string {
  const lib = compactLibrary(library);
  const playing = state.decks
    .filter((d) => d.state === "playing" || d.state === "cued")
    .map((d) => ({ deck: d.slot, track_id: d.track_id, state: d.state }));

  // ids already committed (frozen) so the model doesn't reuse them in the tail
  const frozenIds = current.tracks
    .filter((t) => t.play_in_bar < state.next_safe_edit_bar)
    .map((t) => t.track_id);

  return `JOB: re-steer the set LIVE. Rewrite ONLY the future tail and bump the version.

OPERATOR JUST SAID: "${text}"

LIVE STATE (from the engine — plan against reality, not a stale mental model)
- now_bar: ${Math.round(state.now_bar)}, now_bpm: ${Math.round(state.now_bpm)}
- currently on deck: ${JSON.stringify(playing)}
- time_remaining_in_set_bars: ${Math.round(state.time_remaining_in_set_bars)}
- next_safe_edit_bar: ${state.next_safe_edit_bar}   ← you may ONLY place tracks/transitions at bars >= this
- current plan version: ${current.version}

CONSTRAINTS
- Emit version ${current.version + 1}, valid_from_bar ${state.next_safe_edit_bar}.
- Do NOT touch anything below bar ${state.next_safe_edit_bar} — that past is frozen and committed.
- Continue smoothly from the playing track; keep the key moves legal under the policy below.
- Already-played ids (avoid repeating unless intentional): ${JSON.stringify(frozenIds)}

RULES
${rulesLines(brief)}

LIBRARY (use ONLY these track_ids)
${JSON.stringify(lib)}

${SCHEMA_REMINDER}

NOTE: only include tracks/transitions for the FUTURE tail (bar >= ${state.next_safe_edit_bar}); the engine re-attaches the frozen past itself.`;
}

/** The vision prompt for extracting a tracklist from a Spotify screenshot. */
export function screenshotPrompt(): string {
  return `You are reading a screenshot of a music playlist (e.g. Spotify, Apple Music, a DJ set list).
Extract EVERY song you can see, in order, top to bottom.
Return ONLY a JSON object of the form:
{ "tracks": [ { "title": "<song title>", "artist": "<primary artist>" }, ... ] }
- One entry per visible row. Preserve on-screen order.
- "title" is the song name; "artist" is the performer (first artist if several).
- If the artist is genuinely not visible for a row, use an empty string for "artist".
- Do not invent songs that aren't shown. Do not include playlist names, headers, durations, or UI labels.
- Output ONLY the JSON object, no prose, no markdown.`;
}
