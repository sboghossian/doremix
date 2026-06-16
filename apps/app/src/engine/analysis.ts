/**
 * Track analysis: decode → BPM (web-audio-beat-detector) → RMS energy, with an
 * IndexedDB cache (via idb) keyed by a content hash so each track is analyzed
 * once, ever. Framework-free; the only browser APIs it touches are AudioContext
 * (passed in) and IndexedDB (guarded for non-browser test runs).
 *
 * BPM is the must-have. Key is left "unknown" for now (cheap key detection isn't
 * worth the WASM weight in slice 1 — the field exists for the v1 upgrade).
 */

import { analyze as detectBpm, guess as guessTempo } from "web-audio-beat-detector";
import { openDB, type IDBPDatabase } from "idb";
import { ANALYSIS_VERSION, type AnalysisResult } from "./types";

const DB_NAME = "doremix-analysis";
const STORE = "tracks";

let dbPromise: Promise<IDBPDatabase | null> | null = null;

/** Open (once) the analysis cache DB. Returns null where IndexedDB is absent. */
function getDB(): Promise<IDBPDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    if (typeof indexedDB === "undefined") return null;
    try {
      return await openDB(DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: "hash" });
          }
        },
      });
    } catch {
      return null; // private mode / disabled storage — analysis still works, just uncached
    }
  })();
  return dbPromise;
}

/**
 * Content hash for the cache key. The spec says "size+name is an acceptable key
 * for now" — we fold both into a stable string. (Real content hashing is a v1
 * nicety; this is collision-safe enough for a personal library.)
 */
export function contentHash(file: { name?: string; size: number }): string {
  const name = file.name ?? "blob";
  return `${file.size}:${name}`;
}

async function readCache(hash: string): Promise<AnalysisResult | null> {
  const db = await getDB();
  if (!db) return null;
  try {
    const hit = (await db.get(STORE, hash)) as AnalysisResult | undefined;
    if (hit && hit.v === ANALYSIS_VERSION) return hit;
    return null;
  } catch {
    return null;
  }
}

async function writeCache(result: AnalysisResult): Promise<void> {
  const db = await getDB();
  if (!db) return;
  try {
    await db.put(STORE, result);
  } catch {
    // non-fatal
  }
}

/** Full-buffer RMS → a perceptual-ish 0..1 energy. Averages all channels. */
export function rmsEnergy(buffer: AudioBuffer): number {
  const channels = buffer.numberOfChannels;
  if (channels === 0) return 0;
  let sumSq = 0;
  let count = 0;
  // Stride the samples — we don't need every one for a loudness estimate, and a
  // 6-minute track is millions of samples. ~50k samples/channel is ample.
  for (let ch = 0; ch < channels; ch += 1) {
    const data = buffer.getChannelData(ch);
    const stride = Math.max(1, Math.floor(data.length / 50000));
    for (let i = 0; i < data.length; i += stride) {
      const s = data[i];
      sumSq += s * s;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const rms = Math.sqrt(sumSq / count);
  // Map RMS (~0..0.4 for typical masters) onto 0..1 with a gentle curve.
  return Math.max(0, Math.min(1, Math.pow(rms * 2.6, 0.7)));
}

/**
 * Decode the file into an AudioBuffer. Resolves a fresh copy of the ArrayBuffer
 * each call (decodeAudioData detaches the buffer), so callers should not reuse.
 */
export async function decode(ctx: AudioContext, file: Blob): Promise<AudioBuffer> {
  const arr = await file.arrayBuffer();
  return await ctx.decodeAudioData(arr);
}

/**
 * Analyze a decoded buffer: BPM + first-beat offset + energy + duration.
 * BPM detection can throw on near-silent/odd material — we fall back to `guess`
 * and then to a neutral 120, never throwing into the caller.
 */
export async function analyzeBuffer(buffer: AudioBuffer): Promise<{
  bpm: number;
  firstBeatSec: number;
  energy: number;
  duration: number;
}> {
  let bpm = 120;
  let firstBeatSec = 0;
  try {
    bpm = await detectBpm(buffer);
  } catch {
    try {
      const g = await guessTempo(buffer);
      bpm = g.bpm;
      firstBeatSec = g.offset;
    } catch {
      bpm = 120;
    }
  }
  // round to 0.1 — DJ-useful precision
  bpm = Math.round(bpm * 10) / 10;
  return {
    bpm: bpm > 0 ? bpm : 120,
    firstBeatSec,
    energy: rmsEnergy(buffer),
    duration: buffer.duration,
  };
}

/**
 * Decode + analyze a file, hitting the IndexedDB cache first. The decoded
 * AudioBuffer is always returned (the engine needs it to play), but BPM/energy
 * come from cache when available so we skip the expensive detection pass.
 *
 * NOTE: the decoded buffer itself is held in memory by the engine, not cached
 * (AudioBuffers aren't structured-clone friendly and re-decode is fast); only
 * the lightweight analysis numbers are persisted.
 */
export async function decodeAndAnalyze(
  ctx: AudioContext,
  file: Blob & { name?: string },
): Promise<{ buffer: AudioBuffer; analysis: AnalysisResult }> {
  const hash = contentHash({ name: file.name, size: file.size });
  const buffer = await decode(ctx, file);

  const cached = await readCache(hash);
  if (cached) {
    return { buffer, analysis: cached };
  }

  const a = await analyzeBuffer(buffer);
  const analysis: AnalysisResult = {
    hash,
    bpm: a.bpm,
    firstBeatSec: a.firstBeatSec,
    energy: a.energy,
    duration: a.duration,
    key: "unknown",
    v: ANALYSIS_VERSION,
  };
  await writeCache(analysis);
  return { buffer, analysis };
}
