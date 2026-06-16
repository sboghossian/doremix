/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  REAL CONDUCTOR — OpenRouter-backed LLM planner.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Implements the `Conductor` interface (`@/core/Conductor`) EXACTLY — same sync
 * signatures the MockConductor has, so `SessionContext` and every other call
 * site stay byte-for-byte unchanged.
 *
 * The catch the interface hides: the real planner is ASYNC (a browser→OpenRouter
 * call), but `planSet`/`reprompt` must return a `CueSheet` *now*. We resolve this
 * the way the spec already says the system behaves:
 *
 *   • `planSet`/`reprompt` return the deterministic HEURISTIC sheet immediately
 *     → the engine starts playing instantly and NEVER stalls.
 *   • In the background we call the LLM, validate+repair the JSON, and when a
 *     better sheet is ready we hand it back through the `onUpdate` callback.
 *     `SessionContext` wires that to `engine.update()` (the same double-buffer
 *     "swap at the next phrase boundary" path a live re-steer uses) + appends the
 *     conductor's richer line to the chat.
 *
 *   • `planMessage`/`steerMessage` return an immediate friendly line (a heuristic
 *     summary, or the "add your key" nudge). The LLM's nicer line, if it comes,
 *     arrives via `onUpdate` too.
 *
 * Graceful by construction: no key → friendly chat line + heuristic plays. Any
 * API error → friendly chat line + the engine keeps its last valid sheet. The
 * LLM is a progressive enhancement on top of an always-playable floor.
 */

import type { Brief, CueSheet, StateReport, Track } from "@/types";
import type { Conductor } from "@/core/Conductor";
import { getModel, getOpenRouterKey } from "@/store/settings";
import { chat, type OpenRouterError } from "./openrouter";
import {
  applyRepromptText,
  heuristicPlan,
  heuristicReprompt,
  newPlanId,
} from "./heuristic";
import { parseCueSheet, type ValidationContext } from "./schema";
import { planUserPrompt, repromptUserPrompt, systemPrompt } from "./prompts";

/** Delivered when the LLM produces a better sheet than the heuristic floor. */
export interface ConductorUpdate {
  /** which plan this refines (matches the sheet returned synchronously) */
  planId: string;
  /** the validated, repaired, engine-ready cue sheet */
  sheet: CueSheet;
  /** the conductor's natural-language line for the chat, if any */
  message: string | null;
  /** "plan" = fresh set; "reprompt" = live re-steer */
  kind: "plan" | "reprompt";
}

export interface ConductorCallbacks {
  /** a better cue sheet is ready — push it to the engine + log the line */
  onUpdate?: (update: ConductorUpdate) => void;
  /** a friendly status/error line for the chat (no key, API error, …) */
  onMessage?: (text: string) => void;
}

/** Turn a typed OpenRouter error into a short, friendly chat line. */
function friendly(err: OpenRouterError): string {
  switch (err.kind) {
    case "no_key":
      return "Add your OpenRouter key in Settings and I'll plan this for real. Running a local mix for now.";
    case "auth":
      return "Your OpenRouter key was rejected — re-check it in Settings. Holding the current mix.";
    case "payment":
      return "That OpenRouter key is out of credits. Top it up and re-steer. Holding the current mix.";
    case "rate_limit":
      return "OpenRouter is rate-limiting us for a sec — keeping the current mix steady.";
    case "network":
      return "Couldn't reach OpenRouter (offline?). Keeping the current mix on track.";
    default:
      return "Hit a snag reaching the planner — staying on the current mix.";
  }
}

export class RealConductor implements Conductor {
  private lastBrief: Brief | null = null;
  private lastLibrary: Track[] = [];
  private callbacks: ConductorCallbacks = {};
  /** guards against a stale in-flight call clobbering a newer plan */
  private requestSeq = 0;

  /** SessionContext calls this once to wire the async results back in. */
  setCallbacks(cb: ConductorCallbacks): void {
    this.callbacks = cb;
  }

  // ───────────────────────────── planSet ──────────────────────────────────

  planSet(brief: Brief, library: Track[]): CueSheet {
    this.lastBrief = brief;
    this.lastLibrary = library;

    const planId = newPlanId();
    const floor = heuristicPlan(brief, library, planId); // instant, always playable
    const seq = (this.requestSeq += 1);

    void this.refinePlan(brief, library, planId, seq);
    return floor;
  }

  private async refinePlan(
    brief: Brief,
    library: Track[],
    planId: string,
    seq: number,
  ): Promise<void> {
    const ctx: ValidationContext = {
      tracks: library.filter((t) => t.analyzed).map((t) => ({ id: t.id, bpm: t.bpm, key: t.key })),
      harmonicOnly: brief.rules.harmonicOnly,
      expectVersion: 1,
      validFromBar: 0,
    };

    const result = await this.askForSheet(planUserPrompt(brief, library), systemPrompt(), ctx);

    if (seq !== this.requestSeq) return; // a newer plan superseded us — drop
    if (!result) return; // error already surfaced via onMessage

    this.callbacks.onUpdate?.({ planId, sheet: result.sheet, message: result.message, kind: "plan" });
  }

  // ──────────────────────────── reprompt ──────────────────────────────────

  reprompt(text: string, state: StateReport, current: CueSheet): CueSheet {
    const brief = this.lastBrief
      ? applyRepromptText(text, this.lastBrief)
      : applyRepromptText(text, fallbackBrief(text));
    this.lastBrief = brief;

    const floor = heuristicReprompt(brief, this.lastLibrary, state, current); // instant, legal tail
    const seq = (this.requestSeq += 1);

    void this.refineReprompt(text, state, current, brief, this.lastLibrary, seq);
    return floor;
  }

  private async refineReprompt(
    text: string,
    state: StateReport,
    current: CueSheet,
    brief: Brief,
    library: Track[],
    seq: number,
  ): Promise<void> {
    const ctx: ValidationContext = {
      tracks: library.filter((t) => t.analyzed).map((t) => ({ id: t.id, bpm: t.bpm, key: t.key })),
      harmonicOnly: brief.rules.harmonicOnly,
      expectVersion: current.version + 1,
      validFromBar: state.next_safe_edit_bar,
    };

    const userPrompt = repromptUserPrompt(text, state, current, brief, library);
    const result = await this.askForSheet(userPrompt, systemPrompt(), ctx, current, state);

    if (seq !== this.requestSeq) return;
    if (!result) return;

    this.callbacks.onUpdate?.({
      planId: current.plan_id,
      sheet: result.sheet,
      message: result.message,
      kind: "reprompt",
    });
  }

  // ─────────────────────────── messages ───────────────────────────────────

  /**
   * Immediate spoken line when a set is first spun. The LLM's richer line (if it
   * arrives) replaces nothing — it's appended later via onUpdate. This keeps the
   * chat responsive the instant the user hits "spin".
   */
  planMessage(brief: Brief, sheet: CueSheet): string {
    const n = sheet.tracks.length;
    const opener = sheet.tracks[0];
    const opensWith = this.lastLibrary.find((t) => t.id === opener?.track_id);
    const arc =
      brief.arc === "rising"
        ? "a steady climb to the top"
        : brief.arc === "wave"
          ? "an ebb-and-flow with a few peaks"
          : "a long build, then the peak, then a release";
    const lead = opensWith
      ? `Opening with ${opensWith.title} in ${opener?.key ?? opensWith.key}.`
      : `Opening soft in ${opener?.key ?? "8A"}.`;
    return `${lead} Sketched ${n} tracks over ${brief.lengthMin} min — ${arc}. Tightening it with the planner now…`;
  }

  /** Immediate spoken line on a live re-steer (mirrors the mock's phrasing). */
  steerMessage(text: string, state: StateReport, next: CueSheet): string {
    const t = text.toLowerCase();
    const safe = state.next_safe_edit_bar;
    const upcoming = next.tracks.find((tr) => tr.play_in_bar >= safe);
    const upTrack = upcoming ? this.lastLibrary.find((x) => x.id === upcoming.track_id) : undefined;
    const toKey = upcoming?.key ? `, moving to ${upcoming.key}` : "";
    const named = upTrack ? ` Next up: ${upTrack.title}.` : "";

    if (/(build|raise|harder|peak|energy|hype|drop now|double|up)/.test(t)) {
      return `Lifting the energy over the next 16 bars${toKey}.${named}`;
    }
    if (/(cool|chill|cool it|down|release|breathe|easy)/.test(t)) {
      return `Pulling it back, easing from bar ${safe}${toKey}.${named}`;
    }
    if (/(instrumental|no vocals)/.test(t)) return `Going instrumental from here on${toKey}.${named}`;
    if (/(more vocals|vocal)/.test(t)) return `Bringing the vocals back in${toKey}.${named}`;
    if (/(extend|longer|stretch)/.test(t)) return `Stretching the set out — rewriting from bar ${safe}.${named}`;
    if (/surprise/.test(t)) return `Throwing a curveball into the back half${toKey}.${named}`;
    return `On it — rewriting from bar ${safe}${toKey}.${named}`;
  }

  // ──────────────────────────── internals ─────────────────────────────────

  /**
   * Shared LLM round-trip: read key+model from settings, call OpenRouter, parse
   * + validate + repair, and re-ask ONCE with the validation errors if the first
   * pass doesn't yield a valid sheet. Returns null (after surfacing a friendly
   * line) on any unrecoverable failure — the heuristic floor already plays.
   *
   * The key is read from settings at call time (never earlier), so a key pasted
   * after the app loads is picked up on the next plan/steer.
   */
  private async askForSheet(
    userPrompt: string,
    system: string,
    ctx: ValidationContext,
    current?: CueSheet,
    state?: StateReport,
  ): Promise<{ sheet: CueSheet; message: string | null } | null> {
    const [key, model] = await Promise.all([getOpenRouterKey(), getModel()]);
    if (!key) {
      this.callbacks.onMessage?.(friendly({ kind: "no_key", message: "" }));
      return null;
    }

    const first = await chat({ key, model, system, user: userPrompt, maxTokens: 4000 });
    if (!first.ok) {
      this.callbacks.onMessage?.(friendly(first.error));
      return null;
    }

    const parsed = parseCueSheet(first.content, ctx);
    if (parsed.ok && parsed.sheet) {
      return { sheet: parsed.sheet, message: parsed.message };
    }

    // one repair re-ask, handing the model its own validation errors
    const repairPrompt = `${userPrompt}

YOUR PREVIOUS RESPONSE WAS INVALID. Fix exactly these problems and re-emit the FULL JSON object:
${parsed.errors.slice(0, 8).map((e) => `- ${e}`).join("\n")}`;

    const second = await chat({ key, model, system, user: repairPrompt, maxTokens: 4000 });
    if (!second.ok) {
      this.callbacks.onMessage?.(friendly(second.error));
      return null;
    }
    const reparsed = parseCueSheet(second.content, ctx);
    if (reparsed.ok && reparsed.sheet) {
      return { sheet: reparsed.sheet, message: reparsed.message };
    }

    // the LLM truly failed twice. The heuristic floor is already playing; if this
    // was a re-steer, hand back a freshly-built legal heuristic tail so the steer
    // still lands rather than silently no-op'ing.
    if (current && state && this.lastBrief) {
      const tail = heuristicReprompt(this.lastBrief, this.lastLibrary, state, current);
      this.callbacks.onMessage?.(
        "Planner couldn't lock a clean tail — steering with a local harmonic mix instead.",
      );
      return { sheet: tail, message: null };
    }
    this.callbacks.onMessage?.("Planner returned something I couldn't use — staying on the local mix.");
    return null;
  }
}

/** A sane default brief when the conductor is re-steered before any plan exists. */
function fallbackBrief(text: string): Brief {
  return {
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
  };
}
