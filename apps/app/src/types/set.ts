import type { Brief } from "./brief";
import type { CueSheet } from "./cue-sheet";

/**
 * A SET is a project — the "1 session = 1 project" model. It holds the brief
 * (the vibe), the selected crate (track ids from the shared global library),
 * the chat transcript with the conductor, and — once spun — the live CueSheet.
 *
 * Sets persist to localStorage so they survive reload. The CueSheet is the
 * machine artifact; everything else is the human-facing project shell.
 */

export type SetPhase = "compose" | "live";

export interface ChatMessage {
  id: string;
  /** "you" = the operator; "conductor" = the machine reply */
  role: "you" | "conductor";
  text: string;
  ts: number;
}

export interface DoremixSet {
  id: string;
  name: string;
  /** the brief drives the conductor; mirrors what the user typed + chips */
  brief: Brief;
  /** track ids (from the shared global library) staged in this set's crate */
  crate: string[];
  /** conversation with the conductor (compose + live steers + replies) */
  chat: ChatMessage[];
  /** the live plan once spun; null while still composing */
  cueSheet: CueSheet | null;
  createdAt: number;
  updatedAt: number;
}
