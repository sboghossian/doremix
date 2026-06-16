/**
 * Doremix real audio engine — framework-free. Lift this whole directory into
 * `packages/engine` for the native (Tauri) v1; it imports only `@/types`,
 * `@/core/Engine` (the interface), and npm deps (web-audio-beat-detector, idb).
 */

export { RealEngine } from "./RealEngine";
export type { EngineTrack, AnalysisResult, LoadedAsset, DeckId } from "./types";
export {
  barDurationSec,
  beatDurationSec,
  tempoMatchRatio,
  nextSafeEditBar,
  quantizeToPhrase,
  advanceBar,
  bpmAtBar,
  setLengthBars,
  secondsUntilBar,
  LOOKAHEAD_BARS,
  PHRASE_BARS,
  BEATS_PER_BAR,
} from "./barClock";
export {
  resolveFrame,
  applyReplanFreeze,
  activeTransitionAt,
} from "./cueExecutor";
export type { ResolvedFrame, DeckPlan } from "./cueExecutor";
export {
  constantPower,
  transitionTargets,
  neutralTargets,
} from "./transitions";
export type { DeckTargets, TransitionTargets } from "./transitions";
export {
  decodeAndAnalyze,
  analyzeBuffer,
  rmsEnergy,
  contentHash,
  decode,
} from "./analysis";
