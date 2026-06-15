# Doremix

> Describe the vibe. It conducts a live, editable mix of your own tracks.

Doremix is a browser-based AI DJ. You bring your music, tell it the night in plain language — playlist, audience, energy arc — and it beatmatches a continuous set you can re-steer mid-mix ("crowd's going off, keep it upbeat"). Bring your own LLM key. Your tracks never leave your machine.

**Status:** Early development, building in public. v0 is a browser app (no install). The DJ sibling of [Doremi](https://github.com/sboghossian/doremi).

---

## Why this exists

The "AI DJ" splits into two halves nobody has fused:

- **Spotify's AI DJ** talks and curates — but plays full tracks with radio fades. No beatmatching.
- **djay / Serato / Traktor** beatmatch and separate stems brilliantly — but there's no conductor; you still drive every knob.

Doremix is the missing square: an **LLM conductor** over **real beatmatched mixing** of **tracks you own**, **steerable live**. As of this writing, nothing ships this.

## How it works

1. **Bring your tracks** — drag a folder in. Each is analyzed locally (BPM, key, energy, beatgrid). Nothing uploads.
2. **Describe the set** — "40-minute sunset rooftop, build slow, no vocals after the peak." Or import a Spotify playlist (names only → matched to your files).
3. **It conducts** — the LLM emits a [cue sheet](docs/CUE-SHEET-SPEC.md); a deterministic Web Audio engine plays it, beatmatched and harmonic.
4. **Steer it live** — type or tap a quick-prompt; the edit lands at the next phrase boundary, no dropout. A mic "energy meter" reads the room.
5. **Export** — render the set to WAV + the cue sheet.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the conductor/engine split and the lookahead model that makes live re-prompting glitch-free.

## Stack

Vite + React + TypeScript · Web Audio API + AudioWorklet · [signalsmith-stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch) (keylock, MIT) · Essentia.js (BPM/key/energy) · Tone.js (transport) · LLM via [OpenRouter](https://openrouter.ai) (BYO key). Local-first, zero required backend.

## Monorepo

| Folder | What |
| --- | --- |
| [`apps/app`](apps/app) | The Doremix web app |
| [`apps/landing`](apps/landing) | Landing page → [doremix.dashable.dev](https://doremix.dashable.dev) |
| [`packages/engine`](packages/engine) | Deterministic audio engine (framework-free, native-reusable) |
| [`packages/conductor`](packages/conductor) | LLM planner: prompt → cue sheet |
| [`bricks`](bricks) | Community transition / sound packs |
| [`brand`](brand) | Brand system + moodboard |
| [`docs`](docs) | Architecture, cue-sheet spec |

## Roadmap

- **v0 (browser, now):** drag-in files, conductor + real beatmatching, live re-prompt, mic energy, export. No stems.
- **v1 (native, Tauri):** cached stem separation on Apple Silicon → stem-swap transitions, Web MIDI controllers, voice prompting.
- **Vision:** the gesture/hardware layer, shared with Doremi — perform and steer the room with your hands.

## License

[MIT](LICENSE). Use it, fork it, sell it. Contribute back if you can.

## A note on sources

No streaming API hands over raw audio (Spotify even removed BPM/key metadata for new apps in Nov 2024). Doremix mixes **files you own**. The public demo library uses Creative-Commons sources (Jamendo, Pixabay, ccMixter). It does not download from Spotify, Apple, or YouTube.
