/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CONDUCTOR SEAM — the REAL (OpenRouter / LLM) conductor.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `RealConductor` implements the `Conductor` interface (`@/core/Conductor`)
 * exactly, so `SessionContext` wires it in for the live path with no call-site
 * changes. It plans a versioned, bar-addressed CueSheet from a Brief + analyzed
 * library via the user's BYO OpenRouter key (`@/store/settings`), and re-steers
 * the frozen-floor tail on reprompt.
 *
 * Because the `Conductor` methods are synchronous but the LLM is not, the real
 * conductor returns a deterministic HEURISTIC sheet instantly (engine never
 * stalls) and streams the refined LLM sheet back through `setCallbacks` →
 * `onUpdate` (engine.update) / `onMessage` (chat). See RealConductor.ts.
 *
 * This whole directory is framework-free (no React) — lift it into
 * `packages/conductor` for the native v1.
 */

export { RealConductor } from "./RealConductor";
export type { ConductorCallbacks, ConductorUpdate } from "./RealConductor";
