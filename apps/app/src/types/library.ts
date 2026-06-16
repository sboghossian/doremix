import type { CamelotKey } from "./cue-sheet";

export type Genre = "house" | "techno" | "disco" | "afro";

/** An analyzed track in the local library. Fake-but-plausible in the prototype. */
export interface Track {
  /** stable id, e.g. "lib:8a31f" */
  id: string;
  title: string;
  artist: string;
  genre: Genre;
  bpm: number;
  key: CamelotKey;
  /** 0..1 */
  energy: number;
  /** seconds */
  duration: number;
  /** true once analysis (mock) has run */
  analyzed: boolean;
  /** has detectable vocals — used by the "no vocals after peak" rule */
  hasVocals: boolean;
  /**
   * Raw audio bytes for tracks the user dropped in. Present only for REAL
   * tracks; absent for the seeded demo library. The RealEngine decodes this.
   * Non-serializable (a File/Blob) — stripped before persisting sets.
   */
  file?: Blob;
  /**
   * True for the seeded fake-but-plausible library (no audio). Lets the mock
   * demo path keep working while real (file-bearing) tracks trigger live mode.
   */
  isDemo?: boolean;
}

/** Result of matching an imported playlist against the local library. */
export interface PlaylistMatch {
  /** raw name parsed from the paste */
  query: string;
  /** matched library track, if any */
  matched: Track | null;
}
