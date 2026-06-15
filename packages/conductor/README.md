# @doremix/conductor

The LLM planner. Turns your words + the track analysis into a versioned, bar-addressed [cue sheet](../../docs/CUE-SHEET-SPEC.md), and re-plans the future tail when you steer mid-set.

Talks to your LLM via [OpenRouter](https://openrouter.ai) with **your** key, stored locally and never proxied through us. Plans the future, never the currently-playing bar; the engine's 30–60s lookahead buffer makes round-trip latency invisible.

**Status:** interface defined and mocked in [`apps/app/src/core`](../../apps/app/src/core). Real OpenRouter client + JSON-schema-validated planner is the next build (Phase 2).
