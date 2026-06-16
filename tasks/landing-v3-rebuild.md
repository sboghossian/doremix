# Doremix landing v3 — viral, alive, Lovable-inspired rebuild

## Goal
Single self-contained `apps/landing/index.html`, zero-dep (Google Fonts + vanilla JS),
CF-Pages-ready. THE showpiece. Anti-slop, no emoji, no em-dash.

## Preserve + evolve (hero)
- [x] Keep animated glowing energy curve (RAF, beat-pulse, mesh blobs, grain)
- [x] Keep "Vibe your set." gradient headline treatment
- [x] Keep gradient-mesh club-lights background

## The 3 explicit asks
1. [x] PROMPT-TO-SET interactive hero: Lovable-style glowing prompt box +
       example-vibe chips. Click chip / "Spin it" -> live mini-preview animation:
       curve draws build->peak->release, cue rows assemble, 2 mini decks "play"
       with moving playhead. Scripted/canned ok. Magic feel.
2. [x] SHOW REAL UI: product-showcase section. Animated HTML/CSS recreation of:
       - "Your sets" dashboard (project cards + mini energy-curve thumbnails)
       - live set-workspace (big curve + 2 decks + vibe-chat w/ conductor reply + cue panel)
       In glassy browser frame, glow + float/parallax.
3. [x] MANY more animations from hero motif: equalizer bars, scroll-drawn curve
       dividers, animated how-it-works glyphs, floating orbs, self-typing cue
       sheet, beat glints. Tasteful, performant, reduced-motion safe.

## Structure
Nav (wordmark crossfade-x + glow, links, v0 pill) -> PROMPT-TO-SET hero ->
vibe-coding::vibe-DJing parallel -> PRODUCT SHOWCASE -> How it works (4 steps) ->
missing square -> cue-sheet peek (self-typing mono) -> trust strip -> final CTA ->
footer. CTA href="/app".

## Copy
Lead accessible (no decks, no beatmatch needed, just describe). Layer technical
credibility. Viral vibe-coding parallel. Shareable one-liners. No buzzwords/emoji/em-dash.

## Tech + verify
- [x] title, meta desc, OG/twitter tags (+ og:image/twitter:image)
- [x] responsive desktop+mobile, no horizontal overflow @390 (scrollW-clientW = 0)
- [x] prefers-reduced-motion respected (if(reduce) branches + CSS media), RAF paused on tab-hide
- [x] VERIFY: 200, zero console errors, chip fires animation, showcase renders both views,
      both wordmark marks resolve (2), mobile 390 no overflow
- [x] screenshots: desktop full, hero mid-animation, mobile, showcase, booth, cue, how, final
      (/tmp/doremix-*.png)

## Notes
- Fixed one real bug mid-build: malformed conductor chat span (`cond">`).
- Guarded clip-rect widths with Math.max(0,...) — killed a one-time negative-width SVG warning.
- Reveal-on-scroll means a single full-page screenshot shows gaps (observer doesn't fire
  without scrolling); real users see each section animate in. Section heights all correct.
</content>
</invoke>
