import type {
  CueSheet,
  CueTrack,
  CueTransition,
  DeckReport,
  StateReport,
  Track,
} from "@/types";
import { clamp, sampleCurve } from "@/lib/util";
import type { Engine, StateListener } from "./Engine";

const TICK_MS = 120; // UI cadence; report cadence in the spec is 250–500ms
/** How many simulated bars elapse per real second. ~2 bars/s reads as "live". */
const BARS_PER_SECOND = 1.6;
/** Engine commits this far ahead of the playhead (the lookahead buffer). */
const LOOKAHEAD_BARS = 24;
const PHRASE_BARS = 4;

function setLengthBars(sheet: CueSheet): number {
  let max = 0;
  for (const t of sheet.tracks) {
    max = Math.max(max, t.play_in_bar + (t.cue_out_bar - t.cue_in_bar));
  }
  return Math.max(max, 64);
}

/** Earliest bar the Engine accepts edits: next phrase past the lookahead. */
function nextSafeEditBar(nowBar: number): number {
  const floorBar = nowBar + LOOKAHEAD_BARS;
  return Math.ceil(floorBar / PHRASE_BARS) * PHRASE_BARS;
}

function activeTransition(sheet: CueSheet, nowBar: number): CueTransition | null {
  for (const tr of sheet.transitions) {
    if (nowBar >= tr.start_bar && nowBar <= tr.start_bar + tr.duration_bars) {
      return tr;
    }
  }
  return null;
}

/** The track currently sounding (latest play_in_bar <= nowBar). */
function currentTrackIndex(sheet: CueSheet, nowBar: number): number {
  let idx = 0;
  sheet.tracks.forEach((t, i) => {
    if (t.play_in_bar <= nowBar) idx = i;
  });
  return idx;
}

export class MockEngine implements Engine {
  private listeners = new Set<StateListener>();
  private sheet: CueSheet | null = null;
  /** registered tracks (pre-decode targets in the real engine) */
  private library: Track[] = [];
  private nowBar = 0;
  private playing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private mic = 0.3;
  private micTarget = 0.3;
  private lengthBars = 64;
  private elapsedMsInTick = 0;

  load(tracks: Track[]): void {
    this.library = tracks;
  }

  play(cueSheet: CueSheet): void {
    this.sheet = cueSheet;
    this.lengthBars = setLengthBars(cueSheet);
    this.nowBar = 0;
    this.start();
    this.playing = true;
    this.emit();
  }

  update(cueSheet: CueSheet): void {
    // Real engine double-buffers and swaps at the next phrase boundary; here we
    // adopt the new tail immediately but keep nowBar (the frozen past is identical).
    this.sheet = cueSheet;
    this.lengthBars = setLengthBars(cueSheet);
    this.emit();
  }

  pause(): void {
    this.playing = false;
    this.emit();
  }

  resume(): void {
    if (!this.sheet) return;
    this.playing = true;
    this.start();
    this.emit();
  }

  seek(bar: number): void {
    this.nowBar = clamp(bar, 0, this.lengthBars);
    this.emit();
  }

  micEnergy(): number {
    return this.mic;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /** Track ids registered via load() — the real engine pre-decodes these. */
  loadedTrackIds(): string[] {
    return this.library.map((t) => t.id);
  }

  on(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    // wiggle the mic meter whether or not we're playing
    if (Math.random() < 0.2) {
      this.micTarget = clamp(this.micTarget + (Math.random() - 0.45) * 0.25, 0.12, 0.97);
    }
    // when playing, room energy trends toward the planned energy
    if (this.playing && this.sheet) {
      const planned = sampleCurve(
        this.sheet.global.energy_curve.map((p) => ({ bar: p.bar, value: p.energy })),
        this.nowBar,
      );
      this.micTarget = clamp(this.micTarget * 0.7 + planned * 0.3 + (Math.random() - 0.5) * 0.12, 0.1, 0.99);
    }
    this.mic += (this.micTarget - this.mic) * 0.25;

    if (this.playing && this.sheet) {
      this.nowBar += BARS_PER_SECOND * (TICK_MS / 1000);
      if (this.nowBar >= this.lengthBars) {
        this.nowBar = this.lengthBars;
        this.playing = false;
      }
    }
    this.elapsedMsInTick += TICK_MS;
    // emit on every tick (UI wants 120ms smoothness); the spec's 250–500ms is a
    // network-cadence concern that doesn't apply to the in-process mock.
    this.emit();
  }

  private buildDecks(sheet: CueSheet): DeckReport[] {
    const idx = currentTrackIndex(sheet, this.nowBar);
    const currentT: CueTrack | undefined = sheet.tracks[idx];
    const nextT: CueTrack | undefined = sheet.tracks[idx + 1];
    const decks: DeckReport[] = [];

    if (currentT) {
      decks.push({
        slot: currentT.deck_slot,
        track_id: currentT.track_id,
        state: "playing",
        track_bar: clamp(this.nowBar - currentT.play_in_bar + currentT.cue_in_bar, 0, 999),
        active_stems: ["drums", "bass"],
      });
    }
    if (nextT) {
      // "ending" the outgoing once we're inside the transition window
      const tr = activeTransition(sheet, this.nowBar);
      const cueing = tr ? "cued" : "cued";
      decks.push({
        slot: nextT.deck_slot,
        track_id: nextT.track_id,
        state: cueing,
        track_bar: 0,
      });
    }
    return decks;
  }

  private emit(): void {
    if (!this.sheet) return;
    const sheet = this.sheet;
    const report: StateReport = {
      now_bar: Math.round(this.nowBar * 10) / 10,
      now_bpm:
        Math.round(
          sampleCurve(
            sheet.global.tempo_curve.map((p) => ({ bar: p.bar, value: p.bpm })),
            this.nowBar,
          ) * 10,
        ) / 10,
      plan_version_running: sheet.version,
      decks: this.buildDecks(sheet),
      active_transition: activeTransition(sheet, this.nowBar)?.id ?? null,
      time_remaining_in_set_bars: Math.max(0, Math.round(this.lengthBars - this.nowBar)),
      next_safe_edit_bar: nextSafeEditBar(this.nowBar),
      buffer_planned_until_bar: Math.min(
        this.lengthBars,
        Math.round(this.nowBar + LOOKAHEAD_BARS),
      ),
    };
    this.listeners.forEach((l) => l(report));
  }
}
