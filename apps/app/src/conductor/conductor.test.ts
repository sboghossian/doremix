/**
 * Conductor PURE-logic tests — schema validate/repair/fallback + the no-key and
 * LLM-success paths of RealConductor. NO network: the openrouter module and the
 * settings store are mocked, so these run headless and deterministically.
 *
 * What we prove:
 *  1. A well-formed LLM cue sheet validates untouched.
 *  2. A malformed one (string numbers, bad deck, unsorted, missing curves) is
 *     repaired into a valid, spec-conformant sheet.
 *  3. A cue sheet referencing a track_id NOT in the library drops that row and
 *     keeps the valid ones (and fails only if nothing valid survives).
 *  4. The `{message, cue_sheet}` envelope is unwrapped.
 *  5. The frozen-floor (`valid_from_bar`) drops below-floor edits on a re-plan.
 *  6. No key → RealConductor still returns a PLAYABLE heuristic sheet + emits the
 *     friendly "add your key" message (graceful).
 *  7. With a key + a good mocked LLM reply, planSet's background refine pushes a
 *     validated sheet through onUpdate.
 *  8. The heuristic fallback alone yields a playable sheet (ordered bars, valid
 *     decks, real track_ids).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Brief, StateReport, Track } from "@/types";
import { validateCueSheet, parseCueSheet, type ValidationContext } from "./schema";
import { heuristicPlan, BARS_PER_TRACK } from "./heuristic";

// ── mock the network + settings BEFORE importing RealConductor ───────────────
const chatMock = vi.fn();
const keyMock = vi.fn();
vi.mock("./openrouter", () => ({
  chat: (...args: unknown[]) => chatMock(...args),
  vision: vi.fn(),
}));
vi.mock("@/store/settings", () => ({
  getOpenRouterKey: () => keyMock(),
  getModel: () => Promise.resolve("test/model"),
}));

// imported after the mocks are registered
import { RealConductor } from "./RealConductor";

// ── fixtures ─────────────────────────────────────────────────────────────────
const LIB: Track[] = [
  { id: "lib:aaa", title: "Alpha", artist: "A", genre: "house", bpm: 122, key: "8A", energy: 0.4, duration: 360, analyzed: true, hasVocals: false },
  { id: "lib:bbb", title: "Bravo", artist: "B", genre: "house", bpm: 124, key: "9A", energy: 0.6, duration: 380, analyzed: true, hasVocals: false },
  { id: "lib:ccc", title: "Charlie", artist: "C", genre: "techno", bpm: 126, key: "10A", energy: 0.8, duration: 400, analyzed: true, hasVocals: true },
];

const BRIEF: Brief = {
  text: "60-min club build",
  lengthMin: 30,
  audience: "peak_club",
  arc: "rising",
  rules: { noVocalsAfterPeak: false, harmonicOnly: true, noDoubleDrops: false, longBlends: false },
};

const CTX: ValidationContext = {
  tracks: LIB.map((t) => ({ id: t.id, bpm: t.bpm, key: t.key })),
  harmonicOnly: true,
  expectVersion: 1,
  validFromBar: 0,
};

function flush(): Promise<void> {
  // let queued microtasks (the background refine promise chain) settle
  return new Promise((r) => setTimeout(r, 0));
}

// a clean, valid cue sheet the way a good LLM would emit it
const VALID_SHEET = {
  plan_id: "set-2026-06-16T00:00Z",
  version: 1,
  valid_from_bar: 0,
  global: {
    tempo_curve: [{ bar: 0, bpm: 122 }, { bar: 64, bpm: 124 }],
    energy_curve: [{ bar: 0, energy: 0.4 }, { bar: 64, energy: 0.7 }],
    key_policy: "harmonic",
  },
  tracks: [
    { deck_slot: 1, track_id: "lib:aaa", bpm: 122, key: "8A", play_in_bar: 0, cue_in_bar: 16, cue_out_bar: 80 },
    { deck_slot: 2, track_id: "lib:bbb", bpm: 124, key: "9A", play_in_bar: 64, cue_in_bar: 0, cue_out_bar: 64 },
  ],
  transitions: [
    { id: "t1", from_deck: 1, to_deck: 2, type: "bass_swap", start_bar: 56, duration_bars: 8, params: { eq_curve: "log", swap_at_bar: 64 } },
  ],
};

beforeEach(() => {
  chatMock.mockReset();
  keyMock.mockReset();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("schema.validateCueSheet — valid input", () => {
  it("accepts a well-formed cue sheet without repairing", () => {
    const res = validateCueSheet(VALID_SHEET, CTX);
    expect(res.ok).toBe(true);
    expect(res.repaired).toBe(false);
    expect(res.sheet?.tracks).toHaveLength(2);
    expect(res.sheet?.tracks[0].track_id).toBe("lib:aaa");
    expect(res.sheet?.transitions[0].type).toBe("bass_swap");
    expect(res.sheet?.version).toBe(1);
  });
});

describe("schema.validateCueSheet — repair", () => {
  it("coerces string numbers, bad deck slots, and reorders unsorted tracks", () => {
    const malformed = {
      // no plan_id, version as a string, missing global curves entirely
      version: "1",
      tracks: [
        // OUT OF ORDER (bar 64 first), deck_slot bogus, bpm as a string
        { deck_slot: 9, track_id: "lib:bbb", bpm: "124", key: "9a", play_in_bar: 64, cue_in_bar: 0, cue_out_bar: 64 },
        { deck_slot: 2, track_id: "lib:aaa", bpm: 122, key: "8A", play_in_bar: 0, cue_in_bar: 16, cue_out_bar: 80 },
      ],
      transitions: [
        // unknown type → repaired to filter_fade; duration missing → 8
        { id: "tX", from_deck: 1, to_deck: 2, type: "warp_zone", start_bar: 56 },
      ],
    };
    const res = validateCueSheet(malformed, CTX);
    expect(res.ok).toBe(true);
    expect(res.repaired).toBe(true);
    // reordered ascending by play_in_bar
    expect(res.sheet?.tracks.map((t) => t.play_in_bar)).toEqual([0, 64]);
    // bad deck slot coerced into {1,2}
    expect([1, 2]).toContain(res.sheet?.tracks[0].deck_slot);
    // string bpm + lowercase key coerced
    const bravo = res.sheet?.tracks.find((t) => t.track_id === "lib:bbb");
    expect(bravo?.bpm).toBe(124);
    expect(bravo?.key).toBe("9A");
    // unknown transition type repaired
    expect(res.sheet?.transitions[0].type).toBe("filter_fade");
    expect(res.sheet?.transitions[0].duration_bars).toBe(8);
    // missing curves synthesized so the engine still has tempo/energy
    expect(res.sheet?.global.tempo_curve.length).toBeGreaterThan(0);
    expect(res.sheet?.global.energy_curve.length).toBeGreaterThan(0);
  });

  it("unwraps a { message, cue_sheet } envelope", () => {
    const res = validateCueSheet({ message: "Opening soft in 8A.", cue_sheet: VALID_SHEET }, CTX);
    expect(res.ok).toBe(true);
    expect(res.message).toBe("Opening soft in 8A.");
    expect(res.sheet?.tracks).toHaveLength(2);
  });
});

describe("schema.validateCueSheet — bad track_id", () => {
  it("drops a track whose id is not in the library but keeps the valid ones", () => {
    const withGhost = {
      ...VALID_SHEET,
      tracks: [
        ...VALID_SHEET.tracks,
        { deck_slot: 1, track_id: "lib:GHOST", bpm: 130, key: "1A", play_in_bar: 128, cue_in_bar: 0, cue_out_bar: 64 },
      ],
    };
    const res = validateCueSheet(withGhost, CTX);
    expect(res.ok).toBe(true);
    expect(res.repaired).toBe(true);
    const ids = res.sheet?.tracks.map((t) => t.track_id);
    expect(ids).toContain("lib:aaa");
    expect(ids).not.toContain("lib:GHOST");
    expect(res.errors.join(" ")).toMatch(/not in library/);
  });

  it("fails (ok:false) when NO track id is valid → caller falls back", () => {
    const allGhosts = {
      ...VALID_SHEET,
      tracks: [{ deck_slot: 1, track_id: "lib:NOPE", bpm: 120, key: "8A", play_in_bar: 0, cue_in_bar: 0, cue_out_bar: 64 }],
    };
    const res = validateCueSheet(allGhosts, CTX);
    expect(res.ok).toBe(false);
    expect(res.sheet).toBeNull();
  });
});

describe("schema — frozen floor + JSON extraction", () => {
  it("drops below-floor tracks/transitions on a live re-plan", () => {
    const tailCtx: ValidationContext = { ...CTX, expectVersion: 2, validFromBar: 64 };
    const res = validateCueSheet(VALID_SHEET, tailCtx); // track at bar 0 is below the floor
    expect(res.ok).toBe(true);
    // only the bar-64 track survives; the bar-0 one is frozen-out
    expect(res.sheet?.tracks.every((t) => t.play_in_bar >= 64)).toBe(true);
    expect(res.sheet?.version).toBe(2);
    expect(res.sheet?.valid_from_bar).toBe(64);
  });

  it("extracts JSON from fenced / prose-wrapped model text", () => {
    const wrapped = "Sure! Here's the plan:\n```json\n" + JSON.stringify(VALID_SHEET) + "\n```\nEnjoy.";
    const res = parseCueSheet(wrapped, CTX);
    expect(res.ok).toBe(true);
    expect(res.sheet?.tracks).toHaveLength(2);
  });

  it("reports ok:false when there is no JSON at all", () => {
    const res = parseCueSheet("I can't do that.", CTX);
    expect(res.ok).toBe(false);
  });
});

describe("heuristic fallback", () => {
  it("produces a playable sheet: ordered bars, valid decks, real ids", () => {
    const sheet = heuristicPlan(BRIEF, LIB);
    expect(sheet.tracks.length).toBeGreaterThan(0);
    // strictly ascending play_in_bar in BARS_PER_TRACK steps
    for (let i = 1; i < sheet.tracks.length; i += 1) {
      expect(sheet.tracks[i].play_in_bar).toBeGreaterThan(sheet.tracks[i - 1].play_in_bar);
    }
    expect(sheet.tracks[1]?.play_in_bar).toBe(BARS_PER_TRACK);
    // every track id is real, every deck is 1|2
    const libIds = new Set(LIB.map((t) => t.id));
    for (const t of sheet.tracks) {
      expect(libIds.has(t.track_id)).toBe(true);
      expect([1, 2]).toContain(t.deck_slot);
    }
    // a transition before each track after the first
    expect(sheet.transitions.length).toBe(sheet.tracks.length - 1);
    expect(sheet.version).toBe(1);
    expect(sheet.valid_from_bar).toBe(0);
  });
});

describe("RealConductor — no key (graceful)", () => {
  it("returns a playable heuristic sheet synchronously AND emits the add-key message", async () => {
    keyMock.mockResolvedValue(null); // no key stored
    const messages: string[] = [];
    const updates: unknown[] = [];
    const c = new RealConductor();
    c.setCallbacks({ onMessage: (t) => messages.push(t), onUpdate: (u) => updates.push(u) });

    const sheet = c.planSet(BRIEF, LIB);
    // synchronous result is immediately playable
    expect(sheet.tracks.length).toBeGreaterThan(0);
    expect(sheet.version).toBe(1);

    await flush();
    // never called the network without a key; surfaced the friendly nudge
    expect(chatMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(messages.join(" ")).toMatch(/OpenRouter key/i);
  });

  it("planMessage returns an immediate non-empty line", () => {
    const c = new RealConductor();
    const sheet = c.planSet(BRIEF, LIB);
    const msg = c.planMessage(BRIEF, sheet);
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe("RealConductor — with key, good LLM reply", () => {
  it("pushes a validated sheet through onUpdate from the background refine", async () => {
    keyMock.mockResolvedValue("sk-or-test");
    chatMock.mockResolvedValue({
      ok: true,
      content: JSON.stringify({ message: "Opening with Alpha in 8A.", cue_sheet: VALID_SHEET }),
    });
    const updates: { sheet: { tracks: unknown[] }; message: string | null; kind: string }[] = [];
    const c = new RealConductor();
    c.setCallbacks({ onUpdate: (u) => updates.push(u as never) });

    c.planSet(BRIEF, LIB);
    await flush();

    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].kind).toBe("plan");
    expect(updates[0].message).toBe("Opening with Alpha in 8A.");
    expect(updates[0].sheet.tracks).toHaveLength(2);
  });

  it("re-asks ONCE on an invalid reply, then succeeds on the repair", async () => {
    keyMock.mockResolvedValue("sk-or-test");
    chatMock
      .mockResolvedValueOnce({ ok: true, content: "no json here, sorry" })
      .mockResolvedValueOnce({ ok: true, content: JSON.stringify(VALID_SHEET) });
    const updates: unknown[] = [];
    const c = new RealConductor();
    c.setCallbacks({ onUpdate: (u) => updates.push(u) });

    c.planSet(BRIEF, LIB);
    await flush();
    await flush(); // two awaited round-trips

    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(updates).toHaveLength(1);
  });

  it("surfaces a friendly line on an API error and never throws", async () => {
    keyMock.mockResolvedValue("sk-or-test");
    chatMock.mockResolvedValue({ ok: false, error: { kind: "rate_limit", status: 429, message: "429" } });
    const messages: string[] = [];
    const updates: unknown[] = [];
    const c = new RealConductor();
    c.setCallbacks({ onMessage: (t) => messages.push(t), onUpdate: (u) => updates.push(u) });

    const sheet = c.planSet(BRIEF, LIB); // heuristic floor still returned
    expect(sheet.tracks.length).toBeGreaterThan(0);
    await flush();

    expect(updates).toHaveLength(0); // engine keeps its last (heuristic) sheet
    expect(messages.length).toBeGreaterThan(0);
  });
});
