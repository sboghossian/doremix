import type { Brief, CueSheet, StateReport, Track } from "@/types";

/**
 * The Conductor (slow, smart): turns words + track analysis into a versioned,
 * bar-addressed cue sheet. It plans the FUTURE of the set, never the playing bar.
 *
 * In v0 this is an LLM via OpenRouter (BYO key). The prototype ships a
 * MockConductor behind this interface; the real one drops in unchanged.
 */
export interface Conductor {
  /** Plan a fresh set from a brief + the available library → cue sheet v1. */
  planSet(brief: Brief, library: Track[]): CueSheet;

  /**
   * Re-steer mid-set. Given a free-text prompt (or quick-prompt) and the live
   * engine state, rewrite only the tail (bars >= state.next_safe_edit_bar) and
   * emit version+1.
   */
  reprompt(text: string, state: StateReport, current: CueSheet): CueSheet;

  /**
   * The conductor's natural-language voice. When a fresh set is planned it says
   * what it built; when re-steered it says what it's about to do over the next
   * phrase ("Lifting the energy over the next 16 bars, moving to 9A."). The real
   * LLM conductor returns these directly; the mock generates them deterministically.
   */
  planMessage(brief: Brief, sheet: CueSheet): string;
  steerMessage(text: string, state: StateReport, next: CueSheet): string;
}
