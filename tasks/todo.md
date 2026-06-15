# Doremix — Working TODO

Living plan. Started 2026-06-15.

## ✅ Phase 0 — Scope
- [x] Research landscape + tech feasibility + sourcing (15 cross-verified threads)
- [x] Grill 25 decisions (Doremix name, browser-first, local files, near-live, electronic-first, all-3 audiences, user+mic crowd input)
- [x] Architecture + cue-sheet contract + brand system locked

## 🟡 Phase 1 — Foundation & public face (in progress)
- [x] Monorepo scaffold (apps/, packages/, bricks/, brand/, docs/)
- [x] README + LICENSE (MIT) + .gitignore + workspace
- [x] ARCHITECTURE.md + CUE-SHEET-SPEC.md + BRAND.md
- [ ] Brand moodboard (brand/moodboard.html)
- [ ] Landing page (apps/landing/index.html) → doremix.dashable.dev
- [ ] Clickable prototype (apps/app, mocked engine)
- [ ] git init + push public → github.com/sboghossian/doremix
- [ ] **Stephane:** attach doremix.dashable.dev via Cloudflare dashboard

## ⚪ Phase 2 — Make it real (local)
- [ ] packages/engine: Web Audio transport + 2 decks + crossfade/EQ/filter
- [ ] signalsmith-stretch (WASM) keylock + tempo-match + phase-align
- [ ] Essentia.js analysis on file load → IndexedDB cache
- [ ] packages/conductor: OpenRouter client + cue-sheet schema + planner prompt
- [ ] Wire near-live re-prompt loop (lookahead buffer + phrase-boundary swap)
- [ ] Mic energy meter
- [ ] Spotify-screenshot → track-name match against local library
- [ ] Export set → WAV + cue sheet JSON

## ⚪ Phase 3 — Ship
- [ ] /portfolio → stephane.bio
- [ ] First default transition bricks
- [ ] v1 native (Tauri) planning: demucs-mlx stems, Web MIDI

## Open for Stephane
- [ ] Cloudflare: confirm CF Pages deploy + custom domain doremix.dashable.dev
- [ ] OpenRouter default model preference (else I default to a strong reasoner + selector)
