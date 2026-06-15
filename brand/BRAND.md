# Doremix — Brand System

> The DJ sibling of [Doremi](https://github.com/sboghossian/doremi). Talk to your DJ; it spins the night.

This file is the single source of truth for Doremix's identity. Landing page, app UI, moodboard, and prototype all read from these tokens. Don't diverge.

---

## 1. Positioning

- **One-liner:** *Describe the vibe. Doremix conducts a live, editable mix of your own tracks.*
- **What it is:** A browser-based AI DJ. You bring your music, talk to it in plain language (playlist + audience + energy arc), and it beatmatches a continuous set you can re-steer mid-mix. BYO LLM key. Local-first. Open source.
- **Why it's different:** Spotify's AI DJ talks but doesn't beatmatch. djay/Serato beatmatch but have no conductor. Doremix is the missing square: an LLM **conductor** over **real beatmatched mixing** of **tracks you own**, steerable live.
- **Audience (layered, one surface):** music-lovers first (drag in tracks, just talk), pro DJs (harmonic mixing + export), developers (hackable cue-sheet JSON + BYO-key OSS).

## 2. Voice

Founder-direct. Short sentences. Concrete. No buzzwords, no "revolutionary," no em-dash slop, no emoji in product copy. Confident, a little nocturnal. It's a club tool, not an enterprise SaaS.

- ✅ "Drag in your tracks. Tell it the vibe. Hit play."
- ✅ "It builds the energy, you call the drops."
- ❌ "Leverage AI to revolutionize your music experience."

## 3. The core visual idea: the energy curve

The product's central concept is the **energy arc** of a set — it rises, peaks, releases. That curve **is** the brand. A single living line/spectrum that climbs and falls is the recurring motif: in the logo, the loader, the section dividers, the live UI. Everything else is quiet so the curve can sing.

## 4. Color

Dark canvas, one warm-to-cool **energy spectrum** as the only chroma. Avoid generic "AI purple."

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0B0B0F` | Primary background (warm near-black) |
| `--ink-2` | `#14141B` | Raised surfaces, cards |
| `--ink-3` | `#1E1E28` | Borders, deck lanes |
| `--paper` | `#F4F1EA` | Light-mode / text-on-dark high contrast (warm off-white, Doremi family) |
| `--mist` | `#A6A3B0` | Secondary text |
| `--energy-1` | `#FF3D81` | Spectrum start — magenta (high energy / peak) |
| `--energy-2` | `#FF9F1C` | Spectrum mid — amber (drive) |
| `--energy-3` | `#2EC4B6` | Spectrum end — teal (cool / release) |
| `--live` | `#3DFF88` | "Live" / recording / playing indicator only |

**The energy gradient** (use for the curve, key CTAs, the wordmark accent):
`linear-gradient(90deg, #FF3D81 0%, #FF9F1C 50%, #2EC4B6 100%)`

Rule: chroma is rationed. Most of the screen is ink + mist. The gradient appears where energy lives (the curve, play state, the primary action). One gradient per view, max.

## 5. Type

- **Display / UI:** `Space Grotesk` (headings, wordmark, buttons) — geometric, a little quirky, club-modern.
- **Body:** `Inter` (paragraphs, labels).
- **Mono / technical:** `JetBrains Mono` (the cue-sheet, BPM/key chips, code, dev surfaces) — the "machine voice" of the conductor.

Load from Google Fonts (or self-host for the app). Headings: tight tracking (`-0.02em`), weight 500–700. Mono is used deliberately to signal "this is the machine talking" (cue sheet, track metadata).

## 6. Logo / wordmark

- **Wordmark:** `Doremix` in Space Grotesk Medium. The **`x`** is rendered as a **crossfade** — two short waveform strokes crossing (one fading out, one fading in), the literal DJ blend. Subtle energy-gradient on the `x` only.
- **Mark (standalone):** three rising bars that echo Doremi's three-wave logo but as an **EQ / energy meter** — bar heights 40% / 70% / 100%, gradient-filled. Doremi = three waves; Doremix = three bars. Family resemblance, own identity.
- Always on ink. Clear space = cap-height around the mark.

## 7. Motion

- The energy curve **breathes** and reacts (idle = slow drift; playing = pulses on the beat).
- Transitions are quick and confident (120–200ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`). No bounce, no slow fades.
- Beat-reactive accents only when audio is playing — never decorative-only animation that screams "template."

## 8. Anti-slop guardrails

No stock DJ clip-art, no glowing neon headphones hero, no purple-gradient-on-black SaaS template, no rounded-blob illustrations, no emoji headings, no "✨". Reference altitude: Linear / Teenage Engineering / a good Boiler Room site — restrained, technical, a little cold, music-first. Show the **product** (the curve, the decks, the cue sheet), not mascots.

## 9. Naming inside the product

- The AI is just "Doremix" (or "the conductor" in docs). No cutesy persona name in UI copy.
- A planned set = a **set**. The plan it emits = the **cue sheet**. A blend between tracks = a **transition**. The live steer chips = **quick prompts**.
