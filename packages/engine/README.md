# @doremix/engine

The deterministic audio engine. Framework-free so the browser v0 and the native (Tauri) v1 share one core.

Owns the audio clock. Decodes, beatmatches (tempo-match + phase-align + keylock via [signalsmith-stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch)), EQs, crossfades, and executes a [cue sheet](../../docs/CUE-SHEET-SPEC.md) sample-accurately. Emits state reports back to the conductor. Never blocks on the LLM; degrades gracefully if the plan buffer runs low.

**Status:** interface defined and mocked in [`apps/app/src/core`](../../apps/app/src/core). Real Web Audio + AudioWorklet implementation is the next build (Phase 2).
