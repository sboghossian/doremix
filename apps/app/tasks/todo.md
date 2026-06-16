# Slice 2 — Real OpenRouter Conductor  ✅ DONE

## Built
- [x] src/conductor/heuristic.ts — framework-free heuristic planner (instant playable fallback) + reprompt-tail.
- [x] src/conductor/schema.ts — CueSheet parse + validate + repair/clamp; invariants (ids exist, bars ordered, decks valid, harmonic policy, frozen floor).
- [x] src/conductor/openrouter.ts — fetch wrapper (chat JSON + vision), Bearer + HTTP-Referer + X-Title, typed errors, never throws.
- [x] src/conductor/prompts.ts — system + plan/reprompt/vision prompts; compact library JSON; {message,cue_sheet} envelope.
- [x] src/conductor/RealConductor.ts — implements Conductor EXACTLY (sync). Heuristic now → LLM refine in background → onUpdate/onMessage. One repair re-ask.
- [x] src/conductor/screenshotImport.ts — File → dataURL → vision → [{title,artist}]; typed errors.
- [x] src/conductor/index.ts — exports RealConductor (alias replaced).
- [x] SessionContext — additive callback wiring (onUpdate → engine.update + chat + reprompt event; onMessage → chat). No signature changes.
- [x] Sets.tsx GlobalCrate — "Upload screenshot" button → importScreenshot → existing fuzzy matcher → existing matched/not-in-crate UI.
- [x] src/conductor/conductor.test.ts — 14 tests: valid / repair / bad-id drop / envelope / frozen-floor / no-key graceful / LLM success / repair re-ask / API-error (mocked, no network).

## Verified
- [x] pnpm build GREEN (tsc -b && vite build, exit 0)
- [x] pnpm test GREEN — 32 passed (18 engine + 14 conductor)
- [x] full repo typecheck GREEN
- [x] landing/, vite.config.ts, RealEngine/engine internals UNTOUCHED
- [x] src/conductor/ is framework-free (zero React imports) → extractable to packages/conductor
