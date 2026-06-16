# Slice 1 — Real Audio Engine + plumbing (apps/app only)

## Contract (locked from reading)
- `Engine` iface: load/play/update/pause/resume/seek/on/micEnergy/isPlaying/dispose. (src/core/Engine.ts)
- `StateReport`: now_bar, now_bpm, plan_version_running, decks[], active_transition, time_remaining_in_set_bars, next_safe_edit_bar, buffer_planned_until_bar.
- CueSheet is BAR-addressed, 4/4. tracks[].play_in_bar / cue_in_bar / cue_out_bar; transitions[].start_bar/duration_bars/type; global.tempo_curve/energy_curve.
- Swap point: SessionContext.tsx L149-150 `new MockEngine()` / `new MockConductor()`.
- Track type: id,title,artist,genre,bpm,key,energy,duration,analyzed,hasVocals. Must extend minimally w/ file handle + isDemo.
- Conductor dir does NOT exist yet (separate agent). Leave clean seam.

## Build
- [x] Add deps: web-audio-beat-detector, idb (+ vitest, fake-indexeddb dev).
- [x] src/engine/ — framework-free (no React):
  - [x] barClock.ts — pure bar math (bars<->seconds, phrase quantize, next_safe_edit_bar, tempo-match ratio).
  - [x] types.ts — engine-local types (EngineTrack w/ File, AnalysisResult, DeckId).
  - [x] analysis.ts — decodeAudioData cache + web-audio-beat-detector BPM + RMS energy; IndexedDB cache via idb keyed by size+name hash.
  - [x] transitions.ts — pure transition scheduling math (gain curves, eq targets per type).
  - [x] cueExecutor.ts — pure: given sheet + nowBar => deck assignments, active transition, gains, eq, playbackRate (testable headless).
  - [x] RealEngine.ts — Web Audio impl of Engine. AudioContext, 2 deck chains (src->lowshelf->mid peaking->highshelf->highpass(filter_fade)->gain->master crossfade), scheduling, StateReport emit on rAF/interval cadence, re-plan freeze >= next_safe_edit_bar at phrase boundary, mic capture (getUserMedia->Analyser->RMS) opt-in, graceful skips.
  - [x] index.ts — barrel.
- [x] src/store/settings.ts — idb-backed BYO key + model store (get/set/clear, never log).
- [x] src/components/SettingsModal.tsx — paste OpenRouter key + model select, v2 styling, local-only note.
- [x] Header button (AppNav) to open settings + Live/Demo mode indicator.
- [x] SessionContext: runtime engine selection (real if key present AND real audio loaded), Live-mode toggle/indicator, mic-enable opt-in method, keep File on Track via library ingest, isDemo flag on mock tracks.
- [x] fileToTrack -> real File-bearing track ingestion path (decode + analyze on add, fill bpm/energy from analysis, fallback to heuristic).
- [x] Conductor seam: import from src/conductor/ with TODO stub fallback so build stays green.

## Verify — DONE
- [x] pnpm build green (root + app): 879 modules, dist JS 340.65kB / gzip 105.82kB.
- [x] vitest smoke: 18/18 pass — bar clock advance, tempo-match ratio, constant-power + cut + bass_swap + filter_fade transitions, cue execution / StateReport emit, re-plan freeze (illegal past-edit rejected). Pure logic — real AudioContext can't run headless, so the deterministic core is unit-tested instead.
- [x] Mock demo path intact: MOCK_LIBRARY flagged isDemo, no File → selectImplFor picks MockEngine; seeded sets + deployed demo unchanged.
- [x] No `any`, no console.*, key never logged (grep-verified).
- [x] Scope: only apps/app/ + tasks/ touched (git status verified). apps/landing + packages untouched.
