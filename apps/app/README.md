# @doremix/app — the Doremix web app (prototype)

The real app shell for **Doremix**, a browser-based AI DJ. You bring your tracks,
brief it in plain language, and it conducts a live, editable mix you can re-steer.

This is the **fully-clickable front-end prototype**. The UI is the real product
shell; the **audio engine and the LLM conductor are mocked** for now (an animated
simulation). The mocks sit behind the exact interfaces the real implementations
will satisfy, so swapping in real cores is a drop-in, not a rewrite.

## Run

```bash
pnpm install
pnpm dev      # vite dev server
pnpm build    # tsc -b + vite build (the green-build gate)
```

## What's mocked vs real

| Concern | Prototype | Real (v0) |
|---|---|---|
| Audio clock / playback | `MockEngine` — a ticking `setInterval` advances `now_bar`, swaps decks, fires transitions, wiggles the mic meter | Web Audio + AudioWorklet + signalsmith-stretch (WASM) |
| Planning | `MockConductor` — harmonic/energy-aware ordering, builds a real cue sheet, rewrites the tail on reprompt | LLM via OpenRouter (BYO key), same cue-sheet output |
| Library / analysis | seeded mock library (~12 tracks) + filename → fake analysis on drop | Essentia.js BPM/key/energy on file load, cached in IndexedDB |
| Mic energy | random-walk toward planned energy | RMS/loudness from the room mic |
| WAV export | stubbed (disabled with a note) | offline render from the engine |
| Cue-sheet export | **real** — serializes the live `CueSheet` to a downloadable `.json` | same |

## Architecture (mirrors `docs/ARCHITECTURE.md`)

The conductor/engine split is preserved verbatim:

- `src/core/Engine.ts` — `Engine` interface: `load`, `play`, `update`, `pause`,
  `resume`, `seek`, `on(stateReport)`, `micEnergy`.
- `src/core/Conductor.ts` — `Conductor` interface: `planSet(brief, library)`,
  `reprompt(text, state, current)`.
- `src/core/MockEngine.ts`, `src/core/MockConductor.ts` — the simulated impls.
- `src/types/cue-sheet.ts` — `CueSheet`, `CueTrack`, `CueTransition`,
  `StateReport`, etc., mirroring `docs/CUE-SHEET-SPEC.md` (bar-addressed, versioned,
  frozen-floor via `valid_from_bar` / `next_safe_edit_bar`).

### To swap in the real engine

1. Implement `Engine` in `packages/engine` (Web Audio). It must emit `StateReport`s
   via `on(...)` and accept `CueSheet`s in `play` / `update`.
2. Implement `Conductor` in `packages/conductor` (OpenRouter client + schema).
3. In `src/store/SessionContext.tsx`, replace `new MockEngine()` / `new MockConductor()`
   with the real classes. Nothing else in the UI changes — it only speaks the
   interfaces and the cue-sheet contract.

## Screens

- **Library** (`/`) — drag-drop ingest, mock analysis, Spotify-playlist name match,
  the analyzed library with BPM/key/energy chips. CTA: New set.
- **Brief** (`/brief`) — chat description + length slider + audience presets +
  energy-arc picker + rule toggles. CTA: Conduct → plans a cue sheet.
- **Booth** (`/booth`) — the showpiece: live energy curve with a moving playhead,
  two decks with generated waveforms, the active transition, the scrolling cue
  sheet (mono machine voice, version bumps on reprompt), the steer panel
  (quick-prompt chips + free text + mic meter), and the transport. Export modal
  renders a fake bounce and a **real** cue-sheet JSON download.

## Brand

Dark ink canvas, chroma rationed to the energy gradient (`#FF3D81 → #FF9F1C →
#2EC4B6`) where energy lives. Space Grotesk (display), Inter (body), JetBrains
Mono (the machine voice). See `brand/BRAND.md` — tokens live in
`tailwind.config.ts`.
