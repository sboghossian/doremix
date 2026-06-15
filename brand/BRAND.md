# Doremix — Brand System (v2: vibe-DJing, vivid, techy)

> Vibe DJing. The DJ sibling of [Doremi](https://github.com/sboghossian/doremi). You don't beatmatch — you describe the night and it spins it, live.

Single source of truth for Doremix's identity. Landing, app, moodboard, prototype all pull from these tokens. v2 deliberately turns the color and energy UP — Lovable-flavored, colorful, techy, alive — while staying crafted (vivid, not slop).

---

## 1. Positioning — "Vibe DJing"

- **The frame:** vibe coding let anyone build by describing it. **Doremix is vibe DJing** — anyone runs a real, beatmatched, continuous set by describing the vibe and steering it live.
- **One-liner:** *Vibe your set. Describe the night, Doremix spins it — beatmatched, live, your own tracks.*
- **Taglines (pick by surface):** "Vibe your set." · "Vibe DJing, for real." · "Describe the night. It spins it."
- **What it is:** a browser AI DJ. Bring your music, talk to it in plain language, it conducts a live mix you can re-steer mid-set. BYO LLM key. Local-first. Open source.
- **Why it's different:** Spotify's AI DJ talks but doesn't beatmatch; djay/Serato beatmatch but have no conductor. Doremix is the missing square: an LLM **conductor** over **real beatmatching** of **tracks you own**, steerable live.
- **Audience (one surface, layered):** music-lovers first (just vibe it), pro DJs (harmonic mixing + export), devs (hackable cue-sheet JSON + BYO key).

## 2. Product structure — 1 session = 1 project

Like a vibe-coding tool. Not three tabs — a **project model**:

- **Home = "Your sets."** A vivid dashboard of saved sets (projects). Each card: name, vibe line, length, BPM range, and a mini energy-curve thumbnail. Big "New set" / "Start vibing" CTA. Empty state = drop your music, start your first set.
- **A set = one living canvas.** Open a set → a single workspace that fuses the **vibe chat** (you describe + steer, the conductor replies), the **live booth** (energy curve, decks, transitions playing), the **crate** (this set's tracks), the **cue sheet**, and the **mic energy** — all in one project view. You name it, it persists, you return and iterate. That's the "1 session = 1 project" model.
- Export lives inside the set.

## 3. The core motif: the energy curve, lit up

The energy arc of a set (rises, peaks, releases) is still the hero. In v2 it's rendered as a **glowing, animated, spectrum-lit line** — the club-lights of the brand. It pulses on the beat when playing.

## 4. Color — vivid club-light spectrum (turn it UP)

Dark glassy canvas, but ALIVE with color. Chroma is no longer rationed — it's the point. Think Lovable's gradient energy + club lighting.

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#0A0A12` | Background (deep blue-black, techy) |
| `--ink-2` | `#10101C` | Raised base behind glass |
| `--glass` | `rgba(255,255,255,0.06)` | Frosted card fill (with `backdrop-blur: 16px`) |
| `--glass-border` | `rgba(255,255,255,0.12)` | Card hairline |
| `--paper` | `#F6F4FF` | High-contrast text on dark |
| `--mist` | `#B4B0CC` | Secondary text |
| `--live` | `#3DFF88` | Playing / live / recording only |

**The spectrum** (6 stops — the club lights, used boldly):
```
--c-magenta #FF2E97   --c-coral #FF6B3D   --c-amber #FFB627
--c-teal    #2EE6C4   --c-cyan  #2EA8FF   --c-violet #9B5CFF
```
**Signature gradient** (hero curve, wordmark, primary CTAs, glows):
`linear-gradient(120deg, #FF2E97, #FF6B3D, #FFB627, #2EE6C4, #2EA8FF, #9B5CFF)`
Animate it (slow hue drift / position shift) so it feels alive.

Surfaces stay dark + glassy; **color comes from gradient, glow, and an animated gradient-mesh background** (soft blurred blobs of magenta/cyan/violet drifting behind glass). It should feel like a dark room full of moving light.

## 5. Visual language — Lovable-flavored, techy

- **Glassmorphism:** frosted cards (`backdrop-filter: blur(16px)`, `--glass` fill, 1px `--glass-border`, soft inner highlight). Generous radius (16–24px) — friendly/rounded, not boxy.
- **Glow:** colored, soft `box-shadow`/`drop-shadow` on the curve, the playing deck, primary buttons (e.g. `0 0 40px rgba(255,46,151,.35)`). Restraint = one or two glows per view, not everything.
- **Gradient mesh background:** 2–4 large blurred gradient blobs drifting slowly behind the glass = the room's lights. Plus subtle film grain on top.
- **Big bold type:** gradient-filled display headlines, heavy weight, tight tracking. Confident and playful.
- **Motion:** animated gradients, beat-reactive glow when playing, smooth springy transitions (160–240ms, `cubic-bezier(0.2,0.8,0.2,1)`), tasteful parallax/scroll-reveal. Lively but never seizure-y; respect `prefers-reduced-motion`.

## 6. Type

- **Display / UI:** `Space Grotesk` (headings, wordmark, buttons) — heavy weights, tight tracking, gradient-fill on hero headlines.
- **Body:** `Inter`.
- **Mono / machine:** `JetBrains Mono` (cue sheet, BPM/key chips, code) — the conductor's machine voice.

## 7. Logo / wordmark

- **Wordmark:** `Doremix` in Space Grotesk. The **`x`** is a **crossfade** — two crossing waveform strokes, one fading out / one in. In v2 the whole wordmark can carry the spectrum gradient with a soft glow.
- **Mark:** three rising **EQ / energy bars** (40% / 70% / 100%), spectrum-filled, glowing — echoes Doremi's three-wave mark (Doremi = waves, Doremix = bars). Beat-reactive when live.

## 8. Voice

Founder-direct, short, concrete — but a touch more playful and nocturnal than v1 (it's a party tool, not enterprise SaaS). No buzzwords, no emoji in product copy, no em-dash slop.

- ✅ "Drop your tracks. Tell it the vibe. Hit play."
- ✅ "It builds the energy. You call the drops."
- ✅ "Vibe DJing — describe the night, it spins it."
- ❌ "Leverage AI to revolutionize your music experience."

## 9. Still-crafted guardrails (vivid ≠ slop)

Go colorful and techy, but it must look *designed*, not template-generated. No literal stock DJ/headphone photos. No flat single-purple gradient (use the full spectrum). Motion must mean something (beat-reactive, energy-arc) — not decorative wobble. Show the **product** (the lit curve, the decks, the cue sheet, the sets dashboard). Reference altitude: **Lovable.dev**, Framer showcase sites, a vivid Vercel/Linear gradient moment, a Boiler Room after-dark feel — colorful, alive, premium.
