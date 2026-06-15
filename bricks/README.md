# Bricks

Community-contributable extensions, the same idea as [Doremi](https://github.com/sboghossian/doremi)'s bricks. Drop one in `~/Doremix/bricks/` (user-local) or contribute it via PR here (shipped with the app).

## Types

| Type | What it does | Folder |
| --- | --- | --- |
| `transition` | A named blend recipe (curve, EQ/filter automation, timing) the conductor can pick | `transitions/` |
| `sound-pack` | One-shots / FX (risers, impacts, vinyl noise) for transitions | `sounds/` |
| `set-preset` | A reusable brief (audience + energy arc + rules) | `presets/` |

A `transition` brick is a JSON manifest that maps to the engine's transition primitives (`bass_swap`, `filter_fade`, `cut`, `echo_out`, `loop_roll`) plus parameters. The conductor reads available bricks and may choose them by name in the cue sheet. See [docs/CUE-SHEET-SPEC.md](../docs/CUE-SHEET-SPEC.md).

**Status:** spec stub. First default transition bricks land with Phase 2.
