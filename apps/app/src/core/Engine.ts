import type { CueSheet, StateReport, Track } from "@/types";

export type StateListener = (report: StateReport) => void;

/**
 * The Engine (fast, dumb, deterministic): owns the audio clock. Decodes,
 * beatmatches, time-stretches, EQs, crossfades, and executes the cue sheet
 * sample-accurately. If the Conductor is late, the Engine keeps playing.
 *
 * In v0 this is Web Audio + AudioWorklet + signalsmith-stretch (WASM). The
 * prototype ships a MockEngine behind this interface that advances a simulated
 * playhead/now_bar and emits StateReports, so the UI is the real shell.
 */
export interface Engine {
  /** Pre-decode / register the tracks the cue sheet will reference. */
  load(tracks: Track[]): void;

  /** Start (or replace) playback of a cue sheet. */
  play(cueSheet: CueSheet): void;

  /** Swap to a re-planned cue sheet (vN+1). Applied at next phrase boundary. */
  update(cueSheet: CueSheet): void;

  pause(): void;
  resume(): void;

  /** Jump the playhead to a bar (mock: clamps to set length). */
  seek(bar: number): void;

  /** Subscribe to StateReports (now_bar, decks, transition, …). */
  on(listener: StateListener): () => void;

  /** Current room-mic energy 0..1 (mocked wiggle). */
  micEnergy(): number;

  isPlaying(): boolean;

  /** Stop the clock and release listeners. */
  dispose(): void;
}
