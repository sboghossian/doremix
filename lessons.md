# Lessons

## 2026-06-15 — Headless QA passes ≠ runs on a real machine (perf)

**What happened:** Shipped a "go crazy" landing fusion that passed 9/9 headless-Chromium QA, but was unusable on the user's real Chrome/Mac: blank screen, cursor vanished, frozen/janky, dead controls — "all of the above."

**Root cause:** The page stacked the three most expensive browser-rendering operations and ran them every frame at Retina DPR:
1. A full-screen `<canvas>` repainting continuously.
2. `backdrop-filter: blur()` glass layers composited *on top of* that animating canvas (re-rasterizes a large blur every frame — the single worst killer).
3. `mix-blend-mode` + `filter: blur()`, plus a `cursor:none` custom-cursor RAF.
Together they peg the GPU/main thread. Headless Chromium has no real compositor, so none of it showed up.

**Fix:** Removed the canvas, all `backdrop-filter`/blur, blend modes, and the custom cursor. Background became a CSS-only animated gradient-mesh (GPU-compositable `transform`/opacity on a few `radial-gradient` blobs); glass became static translucent fills. Result: median 8.3 ms/frame (~120 fps), 0 long tasks, desktop + mobile. Kept the soul (kinetic type, morph fader, spectrum, showcase).

**Rules going forward:**
- Never QA a perf-heavy / animation-heavy page only in headless. Measure real frame timing (inject a rAF sampler: median + worst frame, long-task count) and prefer a real-browser check.
- Never put `backdrop-filter`/`filter: blur()` over content that repaints every frame.
- Avoid full-screen per-frame `<canvas>` for ambient backgrounds when a CSS gradient-mesh will do.
- Avoid `cursor:none` custom cursors — when the main thread stalls, the pointer disappears and the whole page feels broken.
- Content must render with JS broken; reveal-on-scroll is enhancement, never a gate.
