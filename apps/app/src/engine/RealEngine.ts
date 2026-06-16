/**
 * RealEngine — the deterministic Web Audio engine behind the `Engine` interface.
 *
 * Topology (per deck A/B):
 *
 *   AudioBufferSourceNode (playbackRate = beatmatch)
 *     -> BiquadFilter  lowshelf   (bass_swap / EQ low)
 *     -> BiquadFilter  peaking    (EQ mid)
 *     -> BiquadFilter  highshelf  (EQ high)
 *     -> BiquadFilter  highpass   (filter_fade sweep)
 *     -> GainNode      (deck gain / crossfade)            ──┐
 *                                                           ├─> master Gain -> destination
 *     -> (echo send) DelayNode + feedback Gain -> master ──┘
 *
 * The cue sheet is *bar-addressed*; this class keeps a single fractional
 * `nowBar` clock derived from `AudioContext.currentTime`, and every frame asks
 * the pure `resolveFrame()` what each deck should be doing, then writes those
 * targets onto the audio params. Audio scheduling is sample-accurate via the
 * AudioContext; the React UI just consumes the StateReports.
 *
 * Framework-free: no React, no app imports. Lifts cleanly into packages/engine.
 */

import type { CueSheet, StateReport, Track } from "@/types";
import type { Engine, StateListener } from "@/core/Engine";
import {
  advanceBar,
  bpmAtBar,
  secondsUntilBar,
  setLengthBars,
} from "./barClock";
import { applyReplanFreeze, resolveFrame } from "./cueExecutor";
import { decodeAndAnalyze } from "./analysis";
import type { DeckId, EngineTrack, LoadedAsset } from "./types";

/** Report cadence (ms). The spec asks for 250–500ms over the wire; the UI is
 * happy at ~16ms in-process, but we throttle reports to ~80ms to avoid React
 * thrash while keeping the playhead smooth. */
const REPORT_MS = 80;
/** Smoothing time-constant (s) for param ramps so writes don't click. */
const RAMP = 0.02;

interface DeckNodes {
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  highpass: BiquadFilterNode;
  gain: GainNode;
  echoDelay: DelayNode;
  echoFeedback: GainNode;
  echoSend: GainNode;
  /** the currently-scheduled source for this deck's current track, if started */
  source: AudioBufferSourceNode | null;
  /** which track id the live source is playing */
  sourceTrackId: string | null;
}

/** EngineTrack carried on the app's Track via a side channel (see SessionContext). */
interface TrackWithFile extends Track {
  file?: Blob | undefined;
  isDemo?: boolean | undefined;
}

export class RealEngine implements Engine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private decks: Record<DeckId, DeckNodes | null> = { 1: null, 2: null };

  private listeners = new Set<StateListener>();
  private sheet: CueSheet | null = null;

  /** decoded + analyzed assets, keyed by track id (never re-decoded) */
  private assets = new Map<string, LoadedAsset>();
  /** track metadata the cue sheet references (for file handles) */
  private registry = new Map<string, TrackWithFile>();

  private nowBar = 0;
  private playing = false;
  private lengthBars = 64;

  /** AudioContext.currentTime at the last clock integration. */
  private lastTickTime = 0;
  private reportTimer: ReturnType<typeof setInterval> | null = null;
  private rafId: number | null = null;

  // ---- mic ----
  private micStream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micBuf: Float32Array<ArrayBuffer> | null = null;
  private mic = 0.0;
  private micEnabled = false;

  // ---- pending re-plan (double-buffer) ----
  private pendingSheet: CueSheet | null = null;

  /** Lazily create the AudioContext (must be after a user gesture in browsers). */
  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof AudioContext === "undefined") return null;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.decks[1] = this.buildDeck(this.ctx, this.master);
      this.decks[2] = this.buildDeck(this.ctx, this.master);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private buildDeck(ctx: AudioContext, master: GainNode): DeckNodes {
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 120;
    low.gain.value = 0;

    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1000;
    mid.Q.value = 0.8;
    mid.gain.value = 0;

    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 6000;
    high.gain.value = 0;

    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 20;
    highpass.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    // echo send path (parallel): deck gain -> send -> delay -> feedback -> master
    const echoSend = ctx.createGain();
    echoSend.gain.value = 0;
    const echoDelay = ctx.createDelay(2.0);
    echoDelay.delayTime.value = 0.36;
    const echoFeedback = ctx.createGain();
    echoFeedback.gain.value = 0.42;

    low.connect(mid);
    mid.connect(high);
    high.connect(highpass);
    highpass.connect(gain);
    gain.connect(master);

    // echo tap off the post-EQ signal
    gain.connect(echoSend);
    echoSend.connect(echoDelay);
    echoDelay.connect(echoFeedback);
    echoFeedback.connect(echoDelay); // feedback loop
    echoDelay.connect(master);

    return {
      low,
      mid,
      high,
      highpass,
      gain,
      echoDelay,
      echoFeedback,
      echoSend,
      source: null,
      sourceTrackId: null,
    };
  }

  // ---------------------------------------------------------------- Engine API

  load(tracks: Track[]): void {
    for (const t of tracks) {
      const tw = t as TrackWithFile;
      this.registry.set(t.id, tw);
    }
    // kick off decode+analyze for any with audio that we haven't loaded yet.
    void this.ensureAssets(tracks as TrackWithFile[]);
  }

  play(cueSheet: CueSheet): void {
    const ctx = this.ensureCtx();
    this.sheet = cueSheet;
    this.pendingSheet = null;
    this.lengthBars = setLengthBars(cueSheet);
    this.nowBar = cueSheet.valid_from_bar > 0 ? cueSheet.valid_from_bar : 0;
    this.playing = true;

    if (ctx) {
      void ctx.resume();
      this.lastTickTime = ctx.currentTime;
      this.startSourcesForCurrentBar();
      this.startLoops();
    }
    this.emit();
  }

  update(cueSheet: CueSheet): void {
    // Double-buffer: stash the new plan, swap it in at the next phrase boundary
    // (handled in tick()). The frozen past is preserved by applyReplanFreeze.
    this.pendingSheet = cueSheet;
    this.emit();
  }

  pause(): void {
    this.playing = false;
    this.stopLoops();
    // freeze audio: ramp master to 0 quickly, stop sources so a paused set is silent
    const ctx = this.ctx;
    if (ctx && this.master) {
      this.master.gain.setTargetAtTime(0.0001, ctx.currentTime, RAMP);
    }
    this.stopAllSources();
    this.emit();
  }

  resume(): void {
    if (!this.sheet) return;
    const ctx = this.ensureCtx();
    this.playing = true;
    if (ctx && this.master) {
      void ctx.resume();
      this.master.gain.setTargetAtTime(0.9, ctx.currentTime, RAMP);
      this.lastTickTime = ctx.currentTime;
      this.startSourcesForCurrentBar();
      this.startLoops();
    }
    this.emit();
  }

  seek(bar: number): void {
    this.nowBar = Math.max(0, Math.min(bar, this.lengthBars));
    this.stopAllSources();
    if (this.playing && this.ctx) {
      this.lastTickTime = this.ctx.currentTime;
      this.startSourcesForCurrentBar();
    }
    this.emit();
  }

  on(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  micEnergy(): number {
    return this.mic;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  dispose(): void {
    this.stopLoops();
    this.stopAllSources();
    this.stopMic();
    this.listeners.clear();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }

  // ------------------------------------------------------------- mic (opt-in)

  /**
   * Opt-in room-mic capture → RMS loudness → `micEnergy()`. Only call this when
   * the user explicitly enables the mic. Resolves false if permission is denied
   * or no mic API exists; never throws.
   */
  async enableMic(): Promise<boolean> {
    if (this.micEnabled) return true;
    const ctx = this.ensureCtx();
    if (!ctx || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      this.micStream = stream;
      this.micAnalyser = analyser;
      this.micBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      this.micEnabled = true;
      // ensure a loop is running even if not playing, so the meter lives.
      this.startLoops();
      return true;
    } catch {
      return false;
    }
  }

  disableMic(): void {
    this.stopMic();
    this.mic = 0;
    this.emit();
  }

  isMicEnabled(): boolean {
    return this.micEnabled;
  }

  private stopMic(): void {
    if (this.micStream) {
      for (const tr of this.micStream.getTracks()) tr.stop();
    }
    this.micStream = null;
    this.micAnalyser = null;
    this.micBuf = null;
    this.micEnabled = false;
  }

  private sampleMic(): void {
    const analyser = this.micAnalyser;
    const buf = this.micBuf;
    if (!analyser || !buf) return;
    analyser.getFloatTimeDomainData(buf);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i += 1) sumSq += buf[i] * buf[i];
    const rms = Math.sqrt(sumSq / buf.length);
    const target = Math.max(0, Math.min(1, Math.pow(rms * 3.2, 0.7)));
    // smooth toward the live level
    this.mic += (target - this.mic) * 0.3;
  }

  // ------------------------------------------------------------- audio assets

  /**
   * Decode + analyze one real track up-front (on library add), caching the
   * decoded buffer + analysis so playback is instant later. Returns the derived
   * metadata for the UI to patch onto the Track, or null if it can't decode
   * (no audio API / decode failure) — callers keep the heuristic metadata.
   */
  async analyzeTrack(
    id: string,
    file: Blob & { name?: string },
  ): Promise<{ bpm: number; energy: number; duration: number; key: string } | null> {
    const ctx = this.ensureCtx();
    if (!ctx) return null;
    try {
      const { buffer, analysis } = await decodeAndAnalyze(ctx, file);
      this.assets.set(id, { id, buffer, analysis });
      this.registry.set(id, { id, file } as unknown as TrackWithFile);
      return {
        bpm: analysis.bpm,
        energy: analysis.energy,
        duration: analysis.duration,
        key: analysis.key,
      };
    } catch {
      return null;
    }
  }

  private async ensureAssets(tracks: TrackWithFile[]): Promise<void> {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    for (const t of tracks) {
      if (this.assets.has(t.id)) continue;
      if (!t.file) continue; // demo/no-audio track — skip silently
      try {
        const { buffer, analysis } = await decodeAndAnalyze(
          ctx,
          t.file as Blob & { name?: string },
        );
        this.assets.set(t.id, { id: t.id, buffer, analysis });
        // if this asset belongs to a track that should already be sounding, start it.
        if (this.playing && this.sheet) this.startSourcesForCurrentBar();
        this.emit();
      } catch {
        // decode/analysis failed → skip this track, keep going (engine never throws into UI)
      }
    }
  }

  private knownBpm = (trackId: string): number | undefined => {
    return this.assets.get(trackId)?.analysis.bpm;
  };

  // ------------------------------------------------------------- scheduling

  /**
   * Ensure each deck has its current cue-sheet track playing, started at the
   * correct in-track offset, beatmatched. Idempotent: if the right source is
   * already live on a deck, it's left alone.
   */
  private startSourcesForCurrentBar(): void {
    const ctx = this.ctx;
    const sheet = this.sheet;
    if (!ctx || !sheet) return;
    const frame = resolveFrame(sheet, this.nowBar, this.knownBpm);

    for (const plan of frame.decks) {
      const deck = this.decks[plan.slot];
      if (!deck) continue;
      const cue = plan.cue;

      if (!cue) {
        this.stopDeckSource(plan.slot);
        continue;
      }
      // already playing the right track? leave it.
      if (deck.sourceTrackId === cue.track_id && deck.source) continue;

      const asset = this.assets.get(cue.track_id);
      if (!asset) {
        // no decoded buffer yet (still analyzing / demo) — skip, will retry on load.
        this.stopDeckSource(plan.slot);
        continue;
      }

      this.stopDeckSource(plan.slot);

      const src = ctx.createBufferSource();
      src.buffer = asset.buffer;
      src.playbackRate.value = plan.playbackRate;

      // in-track start offset (seconds): how far into THIS track we are now.
      const trackBpm = asset.analysis.bpm || cue.bpm || 120;
      const barsIntoTrack = Math.max(0, this.nowBar - cue.play_in_bar + cue.cue_in_bar);
      // bars→seconds at the track's own tempo, plus the analyzed first-beat offset.
      const secPerBarTrack = (4 * 60) / trackBpm;
      const offsetSec = Math.min(
        asset.buffer.duration - 0.05,
        asset.analysis.firstBeatSec + barsIntoTrack * secPerBarTrack,
      );

      src.connect(deck.low);
      try {
        src.start(ctx.currentTime, Math.max(0, offsetSec));
      } catch {
        // invalid offset etc — skip this deck gracefully
        continue;
      }
      deck.source = src;
      deck.sourceTrackId = cue.track_id;
    }
  }

  private stopDeckSource(slot: DeckId): void {
    const deck = this.decks[slot];
    if (!deck) return;
    if (deck.source) {
      try {
        deck.source.stop();
      } catch {
        // already stopped
      }
      try {
        deck.source.disconnect();
      } catch {
        /* noop */
      }
    }
    deck.source = null;
    deck.sourceTrackId = null;
  }

  private stopAllSources(): void {
    this.stopDeckSource(1);
    this.stopDeckSource(2);
  }

  // ------------------------------------------------------------- loops

  private startLoops(): void {
    if (this.reportTimer === null) {
      this.reportTimer = setInterval(() => this.report(), REPORT_MS);
    }
    if (this.rafId === null && typeof requestAnimationFrame !== "undefined") {
      const loop = () => {
        this.tick();
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    } else if (this.rafId === null) {
      // headless / test fallback: drive the clock off the report timer instead.
      // (tick() is also idempotent enough to run there.)
    }
  }

  private stopLoops(): void {
    if (this.reportTimer !== null) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }
    if (this.rafId !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
  }

  /** Per-frame: integrate the clock, swap pending plans, write audio params. */
  private tick(): void {
    const ctx = this.ctx;
    if (this.micEnabled) this.sampleMic();
    if (!ctx || !this.sheet || !this.playing) return;

    const now = ctx.currentTime;
    const elapsed = now - this.lastTickTime;
    this.lastTickTime = now;

    this.nowBar = advanceBar(
      this.nowBar,
      elapsed,
      this.sheet.global.tempo_curve,
      this.lengthBars,
    );

    // double-buffer swap at a phrase boundary, applying only the frozen diff.
    if (this.pendingSheet) {
      const freezeBar = Math.max(this.pendingSheet.valid_from_bar, this.nowBar);
      if (this.nowBar + 0.001 >= this.pendingSheet.valid_from_bar) {
        this.sheet = applyReplanFreeze(this.sheet, this.pendingSheet, freezeBar);
        this.lengthBars = setLengthBars(this.sheet);
        this.pendingSheet = null;
      }
    }

    // make sure the right tracks are sounding, then write per-deck targets.
    this.startSourcesForCurrentBar();
    this.writeAudioParams();

    if (this.nowBar >= this.lengthBars) {
      this.nowBar = this.lengthBars;
      this.playing = false;
      this.stopAllSources();
      this.stopLoops();
      this.report();
    }
  }

  /** Push the resolved gain/EQ/echo/playbackRate onto the audio params. */
  private writeAudioParams(): void {
    const ctx = this.ctx;
    const sheet = this.sheet;
    if (!ctx || !sheet) return;
    const frame = resolveFrame(sheet, this.nowBar, this.knownBpm);
    const t = ctx.currentTime;

    for (const plan of frame.decks) {
      const deck = this.decks[plan.slot];
      if (!deck) continue;
      const { targets, playbackRate } = plan;

      deck.gain.gain.setTargetAtTime(clamp01(targets.gain), t, RAMP);
      deck.low.gain.setTargetAtTime(targets.lowDb, t, RAMP);
      deck.highpass.frequency.setTargetAtTime(Math.max(20, targets.highpassHz), t, RAMP);
      deck.echoSend.gain.setTargetAtTime(clamp01(targets.echoSend), t, RAMP);

      if (deck.source) {
        deck.source.playbackRate.setTargetAtTime(playbackRate, t, RAMP);
      }
    }
  }

  // ------------------------------------------------------------- reporting

  private buildReport(): StateReport {
    const sheet = this.sheet;
    if (!sheet) {
      return {
        now_bar: 0,
        now_bpm: 0,
        plan_version_running: 0,
        decks: [],
        active_transition: null,
        time_remaining_in_set_bars: 0,
        next_safe_edit_bar: 0,
        buffer_planned_until_bar: 0,
      };
    }
    return resolveFrame(sheet, this.nowBar, this.knownBpm).report;
  }

  private report(): void {
    if (!this.sheet) return;
    const r = this.buildReport();
    this.listeners.forEach((l) => l(r));
  }

  private emit(): void {
    this.report();
  }

  // expose current bpm helper for any future host needs (kept internal-friendly)
  bpmNow(): number {
    return this.sheet ? bpmAtBar(this.sheet.global.tempo_curve, this.nowBar) : 0;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Re-export the file-bearing track shape so callers can type their tracks. */
export type { EngineTrack };
/** Re-export secondsUntilBar so a host could pre-schedule; engine uses it internally too. */
export { secondsUntilBar };
