# @doremix/app — the Doremix web app (prototype)

The real app shell for **Doremix**, a browser-based AI DJ — **vibe DJing**. You
bring your tracks, describe the night in plain language, and it conducts a live,
editable mix you steer mid-set.

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

The app is served under `/app/` (`vite.config.ts` `base`) with the router
`basename="/app"` — the landing owns the root. Don't change either; the deploy
depends on them.

## Product structure — 1 session = 1 project

Doremix is shaped like a vibe-coding tool: **one set = one project.**

- **Your sets** (`/`) — a dashboard of saved sets (projects). Each card has an
  editable name, the vibe line, length, BPM range, a track count, a mini glowing
  energy-curve thumbnail, and last-touched. A glowing **New set** card starts a
  fresh project. Empty state: "Drop your tracks, start your first set." Sets
  persist to **localStorage** (`doremix.sets.v2`) and survive reload; the app
  seeds two example sets on first open. The **crate** (global music library) is
  shared across every set.
- **Set workspace** (`/set/:id`) — one living canvas. Two states:
  - **Compose** (no plan yet): the **vibe chat** is front and center — describe
    the night — with structured chips (length slider, audience chips, energy-arc
    picker, rule toggles) and this set's crate selector. **Spin it** →
    `MockConductor.planSet` → the set goes live in the same view.
  - **Live**: header (editable name + vibe + transport: play/pause, now-bar / bpm
    / time-left / buffer), the **HERO** glowing animated energy curve with a
    moving beat-reactive playhead, the **decks** (now-playing + next-cued glassy
    cards with waveform / BPM / Camelot key / gain) and a transition viz, the
    **vibe chat** (a real conversation — you steer, the conductor replies with
    short natural-language lines), the **crate**, the collapsible **cue sheet**
    panel (the machine voice, with version bump + "rewriting…" on reprompt), and
    the animated mic **energy** meter. **Render** exports a real, downloadable
    cue-sheet `.json` (the live `CueSheet` serialized) plus a disabled WAV stub.

Reprompts freeze the past (`< next_safe_edit_bar`) and rewrite the tail with a
version bump — the Engine swaps at the next phrase boundary. No dropout.

## What's mocked vs real

| Concern | Prototype | Real (v0) |
|---|---|---|
| Audio clock / playback | `MockEngine` — a ticking `setInterval` advances `now_bar`, swaps decks, fires transitions, wiggles the mic meter | Web Audio + AudioWorklet + signalsmith-stretch (WASM) |
| Planning | `MockConductor` — harmonic/energy-aware ordering, builds a real cue sheet, rewrites the tail on reprompt | LLM via OpenRouter (BYO key), same cue-sheet output |
| Conductor chat replies | `MockConductor.planMessage` / `steerMessage` — deterministic natural-language lines | the LLM returns these directly |
| Library / analysis | seeded mock crate (~12 tracks) + filename → fake analysis on drop | Essentia.js BPM/key/energy on file load, cached in IndexedDB |
| Mic energy | random-walk toward planned energy | RMS/loudness from the room mic |
| Sets persistence | `localStorage` (`doremix.sets.v2`) | IndexedDB |
| WAV export | stubbed (disabled with a note) | offline render from the engine |
| Cue-sheet export | **real** — serializes the live `CueSheet` to a downloadable `.json` | same |

## Architecture (mirrors `docs/ARCHITECTURE.md`)

The conductor/engine split is preserved verbatim:

- `src/core/Engine.ts` — `Engine` interface: `load`, `play`, `update`, `pause`,
  `resume`, `seek`, `on(stateReport)`, `micEnergy`.
- `src/core/Conductor.ts` — `Conductor` interface: `planSet(brief, library)`,
  `reprompt(text, state, current)`, `planMessage(brief, sheet)`,
  `steerMessage(text, state, next)`.
- `src/core/MockEngine.ts`, `src/core/MockConductor.ts` — the simulated impls.
- `src/types/cue-sheet.ts` — `CueSheet`, `CueTrack`, `CueTransition`,
  `StateReport`, etc., mirroring `docs/CUE-SHEET-SPEC.md` (bar-addressed,
  versioned, frozen-floor via `valid_from_bar` / `next_safe_edit_bar`).
- `src/types/set.ts` — `DoremixSet` (the project model: brief + crate ids + chat
  + live cue sheet), `ChatMessage`.

### The swap-seam

`src/store/SessionContext.tsx` is the single seam. It owns the shared library,
the sets (projects), and a singleton `Engine` + `Conductor`. The UI only speaks
the interfaces and the cue-sheet contract — it never touches the mock internals.

To swap in the real engine:

1. Implement `Engine` in `packages/engine` (Web Audio). It must emit
   `StateReport`s via `on(...)` and accept `CueSheet`s in `play` / `update`.
2. Implement `Conductor` in `packages/conductor` (OpenRouter client + schema),
   including the two chat-reply methods.
3. In `src/store/SessionContext.tsx`, replace `new MockEngine()` /
   `new MockConductor()` with the real classes. Nothing else in the UI changes.

## Brand (v2 — vivid)

Dark blue-black glassy canvas, **alive with color**. Chroma comes from the
signature spectrum gradient (`#FF2E97 → #FF6B3D → #FFB627 → #2EE6C4 → #2EA8FF →
#9B5CFF`), colored glow, and the drifting **gradient-mesh** background (the
room's club lights) with film grain. Glassmorphism cards (`backdrop-blur(16px)`),
beat-reactive glow only while playing, `prefers-reduced-motion` respected.
Space Grotesk (display), Inter (body), JetBrains Mono (the machine voice). See
`brand/BRAND.md` — tokens live in `tailwind.config.ts`.
