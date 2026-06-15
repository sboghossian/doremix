# Doremix — Cue Sheet Spec

The cue sheet is the contract between the Conductor (LLM) and the Engine. It is the product. Keep it small, typed, **bar-addressed** (not seconds), and **versioned** so live edits replace only the future.

## Principles

1. **Time in bars/beats**, never seconds — the Engine quantizes; the LLM reasons musically.
2. **Tracks by stable ID** (content hash of the file).
3. **Transitions are typed objects** with a start bar + duration in bars.
4. **Versioned + frozen floor.** `valid_from_bar` marks where the committed/playing past ends. Edits below it are illegal.
5. **Closed loop.** The Engine reports state back so the Conductor re-plans against reality.

## Conductor → Engine: the cue sheet

```jsonc
{
  "plan_id": "set-2026-06-15T22:04Z",
  "version": 7,                 // bumped each re-plan; Engine drops stale versions
  "valid_from_bar": 128,        // everything below this is FROZEN (committed/playing)
  "global": {
    "tempo_curve":  [ {"bar":0,"bpm":122}, {"bar":96,"bpm":126}, {"bar":200,"bpm":124} ],
    "energy_curve": [ {"bar":0,"energy":0.4}, {"bar":128,"energy":0.85}, {"bar":240,"energy":0.6} ],
    "key_policy": "harmonic"    // enforce Camelot-adjacent moves
  },
  "tracks": [
    { "deck_slot": 1, "track_id": "lib:8a31f", "bpm": 124, "key": "8A",
      "downbeat_offset_ms": 38, "play_in_bar": 96, "cue_in_bar": 16, "cue_out_bar": 112,
      "section_labels": [ {"bar":16,"label":"verse"}, {"bar":48,"label":"drop"} ] },
    { "deck_slot": 2, "track_id": "lib:2c90b", "bpm": 126, "key": "9A",
      "play_in_bar": 160, "cue_in_bar": 0, "cue_out_bar": 96 }
  ],
  "transitions": [
    { "id": "t1", "from_deck": 1, "to_deck": 2,
      "type": "bass_swap",        // bass_swap | filter_fade | cut | echo_out | loop_roll
      "start_bar": 156, "duration_bars": 8,
      "params": { "eq_curve": "log", "swap_at_bar": 160 } }
  ],
  "stem_ops": [                   // v1 (stem-capable engine); ignored in v0
    { "deck": 1, "stem": "vocals", "action": "mute",    "at_bar": 152, "ramp_bars": 2 },
    { "deck": 2, "stem": "drums",  "action": "solo_in", "at_bar": 156, "ramp_bars": 4 }
  ]
}
```

## Engine → Conductor: the state report

Emitted every ~250–500ms or on each phrase boundary. This closure is what lets the Conductor plan against reality, not a stale mental model.

```jsonc
{
  "now_bar": 154.5, "now_bpm": 125.1, "plan_version_running": 7,
  "decks": [
    { "slot": 1, "track_id": "lib:8a31f", "state": "playing", "track_bar": 110.5, "active_stems": ["drums","bass"] },
    { "slot": 2, "track_id": "lib:2c90b", "state": "cued", "track_bar": 0 }
  ],
  "active_transition": "t1",
  "time_remaining_in_set_bars": 88,
  "next_safe_edit_bar": 160,          // earliest bar the Engine will accept new ops
  "buffer_planned_until_bar": 184     // how far ahead it's committed
}
```

## Live edit rules

- The Conductor edits only bars `>= next_safe_edit_bar`.
- A re-prompt ("keep it upbeat") = raise the future `energy_curve`/`tempo_curve`, reselect upcoming tracks, rewrite upcoming transitions → emit `version+1`.
- The Engine double-buffers: runs vN, atomically swaps to vN+1 at the next phrase boundary, applies only the diff. Stale versions dropped by `version`.
- If the Conductor is late and the buffer runs low, the Engine degrades gracefully (extend current track, simple harmonic crossfade to the nearest compatible track). It never stalls.

## Transition types (v0)

| type | what it does |
|---|---|
| `cut` | hard switch on the downbeat |
| `filter_fade` | HP the outgoing / LP the incoming while crossfading |
| `bass_swap` | kill outgoing lows, bring incoming lows at `swap_at_bar` (only one track owns sub-bass) |
| `echo_out` | echo/delay tail on the outgoing track as it leaves |
| `loop_roll` | short beat-repeat on the last bar to cover the seam |
