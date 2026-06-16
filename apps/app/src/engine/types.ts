/**
 * Engine-local types. Framework-free (no React, no DOM-React types) so this
 * directory can be lifted into `packages/engine` for the native (Tauri) v1.
 *
 * These intentionally re-export nothing from `@/store` — the engine never
 * imports app/UI code. It speaks only the cue-sheet contract (`@/types`) and
 * these structs.
 */

/** Which physical deck chain a track is staged on. The cue sheet calls these 1|2. */
export type DeckId = 1 | 2;

/**
 * A track the engine can actually play: the library metadata plus the raw bytes
 * (File/Blob) needed to `decodeAudioData`. The app passes these via `load()`.
 *
 * `file` is optional so demo/mock tracks (no audio) flow through the same path
 * and are simply skipped by the real engine (it never throws on a missing buffer).
 */
export interface EngineTrack {
  /** stable library id, e.g. "lib:8a31f" — matches CueTrack.track_id */
  id: string;
  /** raw audio bytes; absent for demo tracks */
  file?: Blob | undefined;
  /** known/decoded duration in seconds (best-effort; refined after decode) */
  duration?: number | undefined;
  /** analysis hint from the library (used as fallback if decode/analysis fails) */
  bpm?: number | undefined;
}

/** Per-track analysis result, cached in IndexedDB keyed by content hash. */
export interface AnalysisResult {
  /** content hash key (size + name) used as the cache id */
  hash: string;
  /** detected beats-per-minute (4/4 assumed) */
  bpm: number;
  /** seconds to the first detected beat/downbeat (best-effort, 0 if unknown) */
  firstBeatSec: number;
  /** approx loudness 0..1 from full-buffer RMS */
  energy: number;
  /** decoded length in seconds */
  duration: number;
  /** Camelot key if estimated; "unknown" for now (BPM is the must-have) */
  key: string;
  /** schema version so stale cache entries can be invalidated */
  v: number;
}

/** Analysis schema version. Bump to invalidate the IndexedDB cache. */
export const ANALYSIS_VERSION = 1;

/** A decoded, analyzed, ready-to-play asset held in memory by the engine. */
export interface LoadedAsset {
  id: string;
  buffer: AudioBuffer;
  analysis: AnalysisResult;
}
