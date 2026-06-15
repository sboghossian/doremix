# Doremix — Architecture & Infrastructure (Step 3)

Status: design locked for v0. This is the map everything else is built against.

---

## 0. The one idea

An LLM cannot touch a sample — it runs at seconds-per-token; the audio callback has ~2.7ms deadlines. So Doremix splits in two:

- **The Conductor** (slow, smart): an LLM that turns your words + the track analysis into a **versioned, bar-addressed cue sheet** (JSON). It plans the *future* of the set and never the currently-playing bar.
- **The Engine** (fast, dumb, deterministic): owns the audio clock. Decodes, beatmatches, time-stretches, EQs, crossfades, and executes the cue sheet sample-accurately. If the Conductor is late, the Engine keeps playing.

A **30–60s lookahead buffer** sits between them. The Engine is always committed ~16–32 bars ahead of the playhead, so LLM latency (1–10s) is structurally invisible. Re-prompts re-plan the *tail*; the edit lands at the next phrase boundary.

This is the same shape as robotics (LLM planner → real-time controller) and live-coding (TidalCycles/Sonic Pi quantize edits to the next cycle). We are not inventing the pattern — we're the first to point it at DJing your own library.

```
   You (text + quick prompts + mic energy)
              │
              ▼
   ┌───────────────────┐     cue sheet (JSON, versioned)      ┌────────────────────┐
   │   CONDUCTOR        │ ───────────────────────────────────▶│   ENGINE           │
   │  (LLM, BYO key)    │                                      │ (Web Audio, WASM)  │
   │  plans the future  │◀─────────────────────────────────── │ owns the clock     │
   └───────────────────┘   state report (now_bar, bpm, …)     └────────────────────┘
              ▲                                                          │
              │                                                          ▼
        OpenRouter                                              your speakers
```

---

## 1. v0 — browser-first (ships now, anyone can test)

Zero install. Open `doremix.dashable.dev`, drag in a folder of your own tracks, talk to it. No stems yet — stems are the v1 native upgrade on the *same* cue-sheet contract.

| Layer | Choice | Why |
|---|---|---|
| App shell | **Vite + React + TypeScript (strict)** | Fast, deployable static, familiar |
| Styling | **Tailwind** + brand tokens | House style; design tokens from `brand/BRAND.md` |
| Audio clock / transport | **Web Audio API + AudioWorklet** | 128-frame (~2.7ms) render quantum; the real-time floor |
| Time-stretch / keylock | **signalsmith-stretch** (WASM, **MIT**) | R3-class quality, browser+native, permissive license |
| Analysis (BPM/key/energy) | **Essentia.js** (WASM) on file load | Self-hosted; Spotify's audio-features API is dead since Nov 2024 |
| Transport scheduling | **Tone.js** (MIT) for the global clock | DAW-grade BPM ramp + sample-accurate scheduling |
| Conductor | **LLM via OpenRouter** (BYO key) | User's key, user's model choice |
| Persistence | **IndexedDB** (analysis cache, sets, prefs) | Local-first; nothing leaves the machine |
| Audio source | **Drag-drop local files** (File System Access API) | Legal, private, zero API. Spotify screenshot → names only |

**Transitions in v0:** constant-power crossfade, EQ **bass-swap**, **filter sweep** (HP/LP), **echo-out**. Track order is **Camelot-constrained** (harmonic). Beatmatching is real (tempo-match + phase-align + keylock), not lazy fades.

**Crowd input (v0):** a mic-level "energy meter" — RMS/loudness from the room mic → surfaced to you and fed to the Conductor as a soft signal ("room is climbing"). You stay in control; it just suggests.

---

## 2. The data flow (one set)

1. **Ingest** — drag in files (or a folder). Each track decoded via Web Audio.
2. **Analyze (cached)** — Essentia.js computes BPM, musical key (Camelot), energy, beatgrid/downbeats. Cached in IndexedDB keyed by content hash. Runs once per track, ever.
3. **(Optional) playlist import** — paste/screenshot a Spotify playlist → extract track *names* → fuzzy-match to your analyzed library. Unmatched = skipped, shown as "not in your library."
4. **Brief** — you describe the set (length, audience, vibe, energy arc, rules like "no vocals after the peak").
5. **Plan** — Conductor emits cue sheet v1 (track order + cue points + transitions + tempo/energy curves). See `CUE-SHEET-SPEC.md`.
6. **Play** — Engine executes, always buffered ahead. UI renders the live energy curve, decks, and the cue sheet.
7. **Re-steer** — you prompt ("keep it upbeat") or tap a quick-prompt; Conductor emits cue sheet vN+1 for bars ≥ `next_safe_edit_bar`; Engine swaps at the next phrase boundary. No dropout.
8. **Export (optional)** — render the set to WAV + the cue sheet JSON (shareable, re-loadable, portfolio-ready).

---

## 3. Cloud footprint — deliberately almost nothing

Doremix is **local-first with zero required backend.** This is a feature (privacy, cost, no servers to keep alive) and matches the Doremi ethos.

| Concern | Where it runs |
|---|---|
| The app | Static site on **Cloudflare Pages** → `doremix.dashable.dev` |
| The landing page | Same CF Pages project (or sibling) |
| Audio + analysis + engine | **100% in your browser** |
| Your tracks | **Never uploaded.** Stay on your disk |
| LLM calls | Direct browser → **OpenRouter** with **your** key (stored locally) |
| Sets / cache / prefs | **IndexedDB**, local |
| Telemetry | **None.** (Opt-in PostHog considered later, off by default) |

The only network calls are: (a) loading the static app, (b) your browser → OpenRouter, (c) optional CC-catalog fetch (Jamendo/Pixabay) for the public demo library. No Doremix server sees your music or your prompts.

> Security note: BYO key in the browser means the key is in browser storage and travels to OpenRouter over TLS. We store it in IndexedDB (not localStorage), never log it, never proxy it through us. Documented plainly for users.

---

## 4. Repo layout (monorepo, mirrors Doremi)

```
doremix/
├── apps/
│   ├── landing/        # static landing → doremix.dashable.dev (zero-dep HTML)
│   └── app/            # the Doremix web app (Vite + React + TS + Tailwind)
├── packages/
│   ├── engine/         # deterministic audio engine (Web Audio + WASM, framework-free)
│   └── conductor/      # LLM planner: prompt → cue sheet (OpenRouter client + schema)
├── bricks/             # community transition/sound packs (Doremi-style extensibility)
├── brand/              # BRAND.md + moodboard
└── docs/               # ARCHITECTURE.md, CUE-SHEET-SPEC.md
```

`engine` and `conductor` are framework-free packages so the eventual **native (Tauri) v1** can reuse them unchanged — the browser v0 and native v1 share the same two cores and the same cue-sheet contract.

---

## 5. Roadmap: v0 → v1 → vision

- **v0 (now, browser):** drag-in files, conductor + real beatmatching, near-live re-prompt, mic energy, export. No stems. Testable by anyone at a URL.
- **v1 (native, Tauri — shares engine/conductor):** `demucs-mlx` cached stem separation on Apple Silicon (~2.7s/track) → stem-swap transitions, acapella-over-instrumental. Web MIDI controller mapping ("the controls you plug in"). Voice prompting (Whisper).
- **Vision (Doremix × Doremi):** the gesture/hardware layer — read the room (camera/MediaPipe, shared with Doremi), perform and steer with your hands. Doremix is the MVP wedge that proves the conductor; Doremi is where it becomes an instrument.
