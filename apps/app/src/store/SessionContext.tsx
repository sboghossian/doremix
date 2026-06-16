import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Brief,
  ChatMessage,
  DoremixSet,
  PlaylistMatch,
  StateReport,
  Track,
} from "@/types";
import { MockConductor, MockEngine } from "@/core";
import type { Conductor, Engine } from "@/core";
import { RealEngine } from "@/engine";
// Conductor seam: the real (OpenRouter) conductor. It implements the same
// Conductor interface; its async LLM results stream back via setCallbacks.
import { RealConductor, type ConductorUpdate } from "@/conductor";
import { MOCK_LIBRARY } from "@/data/mockLibrary";
import { hashStr, shortId } from "@/lib/util";
import { hasOpenRouterKey } from "./settings";
import { loadSets, newSetId, saveSets } from "./setsStorage";

/** Whether the engine driving playback is the real Web Audio one (vs the mock). */
export type EngineMode = "demo" | "live";

export interface RepromptEvent {
  id: string;
  label: string;
  fromVersion: number;
  toVersion: number;
  /** "queued" → animates → "applied" */
  status: "queued" | "applied";
  atBar: number;
  ts: number;
}

interface SessionState {
  /** the shared global library (crate source) — same across every set */
  library: Track[];

  /** all saved sets (projects), newest-touched first */
  sets: DoremixSet[];

  /** the live-engine view (only meaningful for the open, playing set) */
  report: StateReport | null;
  isPlaying: boolean;
  micEnergy: number;
  reprompts: RepromptEvent[];

  engine: Engine;
  conductor: Conductor;

  /** "live" once the real engine is driving (real audio + key); else "demo". */
  engineMode: EngineMode;
  /** true if the user has at least one real (file-bearing) track loaded */
  hasRealAudio: boolean;
  /** true if a BYO OpenRouter key is stored */
  hasKey: boolean;
  /** re-read the stored key (call after the Settings modal saves) */
  refreshKey: () => void;

  /** mic capture is opt-in; these only do anything in live mode */
  micEnabled: boolean;
  enableMic: () => Promise<boolean>;
  disableMic: () => void;

  // ---- library (global crate source) ----
  addTracks: (tracks: Track[]) => void;
  importPlaylistText: (text: string) => PlaylistMatch[];

  // ---- sets (projects) ----
  getSet: (id: string) => DoremixSet | undefined;
  createSet: () => DoremixSet;
  renameSet: (id: string, name: string) => void;
  deleteSet: (id: string) => void;
  updateBrief: (id: string, patch: Partial<Brief>) => void;
  toggleCrateTrack: (id: string, trackId: string) => void;

  /** open a set into the engine (restore its live plan if it has one) */
  openSet: (id: string) => void;

  /** spin the active set: plan from its brief → live + conductor reply */
  spin: (id: string, brief: Brief) => void;

  /** re-steer the active live set; appends chat + rewrites the tail */
  reprompt: (id: string, label: string, text: string) => void;

  togglePlay: () => void;
  seek: (bar: number) => void;
}

const Ctx = createContext<SessionState | null>(null);

/**
 * Turn a dropped file into a Track. When passed the real `File`, the audio
 * bytes ride along (`file`) and the track is REAL (`isDemo` false,
 * `analyzed` false until the engine decodes+analyzes it). Metadata is heuristic
 * until real analysis overwrites bpm/energy/duration.
 *
 * The name-only overload keeps the old demo behaviour (synthetic analyzed track)
 * for any caller that doesn't have the File.
 */
function fileToTrack(name: string, file?: File): Track {
  const clean = name.replace(/\.(mp3|wav|flac|m4a|aiff|ogg)$/i, "");
  const parts = clean.split(/\s+-\s+/);
  const artist = parts.length > 1 ? parts[0] : "Unknown";
  const title = parts.length > 1 ? parts.slice(1).join(" - ") : clean;
  // include size in the seed so two files with the same name don't collide.
  const seed = hashStr(file ? `${clean}:${file.size}` : clean);
  const genres = ["house", "techno", "disco", "afro"] as const;
  const keysA = [
    "8A",
    "9A",
    "10A",
    "11A",
    "12A",
    "1A",
    "8B",
    "9B",
    "10B",
    "11B",
    "12B",
    "1B",
  ] as const;
  const base: Track = {
    id: `lib:${(seed >>> 0).toString(16).slice(0, 6)}`,
    title,
    artist,
    genre: genres[seed % genres.length],
    bpm: 120 + (seed % 9),
    key: keysA[seed % keysA.length],
    energy: 0.3 + ((seed >> 4) % 70) / 100,
    duration: 300 + ((seed >> 8) % 200),
    analyzed: !file, // demo tracks are "analyzed"; real ones aren't until decoded
    hasVocals: (seed & 1) === 0,
  };
  if (file) {
    base.file = file;
    base.isDemo = false;
  } else {
    base.isDemo = true;
  }
  return base;
}

function makeMessage(role: ChatMessage["role"], text: string): ChatMessage {
  return { id: shortId("m"), role, text, ts: Date.now() };
}

function newBlankSet(): DoremixSet {
  const now = Date.now();
  return {
    id: newSetId(),
    name: "Untitled set",
    brief: {
      text: "",
      lengthMin: 40,
      audience: "sunset_rooftop",
      arc: "plateau_peak",
      rules: {
        noVocalsAfterPeak: false,
        harmonicOnly: true,
        noDoubleDrops: false,
        longBlends: false,
      },
    },
    crate: MOCK_LIBRARY.map((t) => t.id),
    chat: [],
    cueSheet: null,
    createdAt: now,
    updatedAt: now,
  };
}

function sortByTouched(sets: DoremixSet[]): DoremixSet[] {
  return [...sets].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  // Two engines live for the whole session; `activeEngine` points at whichever
  // drives the open set. Demo sets (seeded, no audio) use the mock; sets with
  // real dropped-in audio + a stored key use the real Web Audio engine.
  const mockEngineRef = useRef<MockEngine>(new MockEngine());
  const realEngineRef = useRef<RealEngine>(new RealEngine());
  const activeEngineRef = useRef<Engine>(mockEngineRef.current);

  // Two conductors: the deterministic mock (demo path) and the real
  // OpenRouter-backed planner (live path). The real one returns a heuristic
  // sheet synchronously and streams the refined LLM sheet back via callbacks
  // (wired below) → engine.update + chat, exactly like the mock's sync result.
  const mockConductorRef = useRef<MockConductor>(new MockConductor());
  const realConductorRef = useRef<RealConductor>(new RealConductor());
  const activeConductorRef = useRef<Conductor>(mockConductorRef.current);

  const [library, setLibrary] = useState<Track[]>(MOCK_LIBRARY);
  const [sets, setSets] = useState<DoremixSet[]>(() => sortByTouched(loadSets()));
  const [report, setReport] = useState<StateReport | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [micEnergy, setMicEnergy] = useState(0.3);
  const [reprompts, setReprompts] = useState<RepromptEvent[]>([]);
  const [engineMode, setEngineMode] = useState<EngineMode>("demo");
  const [hasKey, setHasKey] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);

  /** the set currently loaded into the engine */
  const activeIdRef = useRef<string | null>(null);
  const setsRef = useRef<DoremixSet[]>(sets);
  const reportRef = useRef<StateReport | null>(null);
  const hasKeyRef = useRef(false);

  useEffect(() => {
    setsRef.current = sets;
  }, [sets]);
  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  // any real (file-bearing) track in the library?
  const hasRealAudio = useMemo(
    () => library.some((t) => t.file != null && !t.isDemo),
    [library],
  );
  const hasRealAudioRef = useRef(hasRealAudio);
  useEffect(() => {
    hasRealAudioRef.current = hasRealAudio;
  }, [hasRealAudio]);

  // Read the stored OpenRouter key on mount + expose a refresher for Settings.
  const refreshKey = useCallback(() => {
    void hasOpenRouterKey().then((present) => {
      hasKeyRef.current = present;
      setHasKey(present);
    });
  }, []);
  useEffect(() => {
    refreshKey();
  }, [refreshKey]);

  // Persist sets to localStorage on every change (File handles are stripped in setsStorage).
  useEffect(() => {
    saveSets(sets);
  }, [sets]);

  /** Subscribe to BOTH engines; route reports from whichever is active. */
  useEffect(() => {
    const onReport = (engine: Engine) => (r: StateReport) => {
      if (activeEngineRef.current !== engine) return;
      setReport(r);
      setIsPlaying(engine.isPlaying());
      setMicEnergy(engine.micEnergy());
    };
    const mock = mockEngineRef.current;
    const real = realEngineRef.current;
    const offMock = mock.on(onReport(mock));
    const offReal = real.on(onReport(real));
    return () => {
      offMock();
      offReal();
      mock.dispose();
      real.dispose();
    };
  }, []);

  /**
   * Decide which engine/conductor should drive a given crate pool, and point
   * the active refs at it. Real engine wins only when the pool actually has
   * decodable audio AND a key is stored — otherwise the deployed demo + seeded
   * example sets keep working on the mock.
   */
  const selectImplFor = useCallback((pool: Track[]): EngineMode => {
    const poolHasRealAudio = pool.some((t) => t.file != null && !t.isDemo);
    const live = poolHasRealAudio && hasKeyRef.current;
    activeEngineRef.current = live ? realEngineRef.current : mockEngineRef.current;
    activeConductorRef.current = live
      ? realConductorRef.current
      : mockConductorRef.current;
    setEngineMode(live ? "live" : "demo");
    return live ? "live" : "demo";
  }, []);

  const enableMic = useCallback(async (): Promise<boolean> => {
    const ok = await realEngineRef.current.enableMic();
    setMicEnabled(ok);
    return ok;
  }, []);

  const disableMic = useCallback(() => {
    realEngineRef.current.disableMic();
    setMicEnabled(false);
  }, []);

  /** mutate one set + bump updatedAt + re-sort, in a single state write */
  const patchSet = useCallback(
    (id: string, fn: (s: DoremixSet) => DoremixSet) => {
      setSets((prev) =>
        sortByTouched(
          prev.map((s) => (s.id === id ? { ...fn(s), updatedAt: Date.now() } : s)),
        ),
      );
    },
    [],
  );

  /**
   * Wire the real conductor's ASYNC results back into the app. Because the
   * Conductor interface is synchronous, `planSet`/`reprompt` already returned a
   * heuristic sheet (the engine is playing it); when the LLM produces a better
   * one it arrives here and we swap the engine to it (same double-buffer path a
   * live re-steer uses) + log the conductor's richer line. `onMessage` is the
   * friendly status/error channel (no key, API error). Both are no-ops unless
   * the update still matches the set currently loaded into the engine.
   */
  useEffect(() => {
    const conductor = realConductorRef.current;
    const applyUpdate = (update: ConductorUpdate) => {
      const id = activeIdRef.current;
      if (!id) return;
      const target = setsRef.current.find((s) => s.id === id);
      // ignore stale results whose plan no longer matches the live set
      if (!target?.cueSheet || target.cueSheet.plan_id !== update.sheet.plan_id) return;
      if (update.sheet.version < target.cueSheet.version) return;

      activeEngineRef.current.update(update.sheet);
      patchSet(id, (s) => ({
        ...s,
        cueSheet: update.sheet,
        chat: update.message
          ? [...s.chat, makeMessage("conductor", update.message)]
          : s.chat,
      }));

      if (update.kind === "reprompt") {
        const evt: RepromptEvent = {
          id: `${update.sheet.version}-llm-${Date.now()}`,
          label: "planner",
          fromVersion: target.cueSheet.version,
          toVersion: update.sheet.version,
          status: "applied",
          atBar: update.sheet.valid_from_bar,
          ts: Date.now(),
        };
        setReprompts((prev) => [evt, ...prev].slice(0, 6));
      }
    };
    const applyMessage = (text: string) => {
      const id = activeIdRef.current;
      if (!id) return;
      patchSet(id, (s) => ({ ...s, chat: [...s.chat, makeMessage("conductor", text)] }));
    };
    conductor.setCallbacks({ onUpdate: applyUpdate, onMessage: applyMessage });
    return () => conductor.setCallbacks({});
  }, [patchSet]);

  const addTracks = useCallback((tracks: Track[]) => {
    let added: Track[] = [];
    setLibrary((prev) => {
      const seen = new Set(prev.map((t) => t.id));
      added = tracks.filter((t) => !seen.has(t.id));
      return [...prev, ...added];
    });

    // For REAL tracks (carry a File), decode + analyze in the background and
    // patch the library row with the detected BPM/energy/duration. Failures are
    // silent: the heuristic metadata stays and the track is still usable.
    for (const t of added) {
      if (!t.file) continue;
      void realEngineRef.current
        .analyzeTrack(t.id, t.file as Blob & { name?: string })
        .then((meta) => {
          if (!meta) return;
          setLibrary((prev) =>
            prev.map((row) =>
              row.id === t.id
                ? {
                    ...row,
                    bpm: Math.round(meta.bpm),
                    energy: meta.energy,
                    duration: Math.round(meta.duration),
                    analyzed: true,
                  }
                : row,
            ),
          );
        });
    }
  }, []);

  const importPlaylistText = useCallback(
    (text: string): PlaylistMatch[] => {
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.replace(/^\d+[.).\s]+/, "").trim())
        .filter((l) => l.length > 1);
      return lines.map((query) => {
        const q = query.toLowerCase();
        const matched =
          library.find((t) => {
            const hay = `${t.artist} ${t.title}`.toLowerCase();
            return (
              hay.includes(q) ||
              q.includes(t.title.toLowerCase()) ||
              t.title
                .toLowerCase()
                .split(" ")
                .some((w) => w.length > 3 && q.includes(w))
            );
          }) ?? null;
        return { query, matched };
      });
    },
    [library],
  );

  const getSet = useCallback(
    (id: string): DoremixSet | undefined => sets.find((s) => s.id === id),
    [sets],
  );

  const createSet = useCallback((): DoremixSet => {
    const fresh = newBlankSet();
    setSets((prev) => sortByTouched([fresh, ...prev]));
    return fresh;
  }, []);

  const renameSet = useCallback(
    (id: string, name: string) => {
      patchSet(id, (s) => ({ ...s, name: name.trim() || "Untitled set" }));
    },
    [patchSet],
  );

  const deleteSet = useCallback((id: string) => {
    if (activeIdRef.current === id) {
      activeIdRef.current = null;
      activeEngineRef.current.pause();
      setReport(null);
      setIsPlaying(false);
      setReprompts([]);
    }
    setSets((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateBrief = useCallback(
    (id: string, patch: Partial<Brief>) => {
      patchSet(id, (s) => ({ ...s, brief: { ...s.brief, ...patch } }));
    },
    [patchSet],
  );

  const toggleCrateTrack = useCallback(
    (id: string, trackId: string) => {
      patchSet(id, (s) => {
        const has = s.crate.includes(trackId);
        return {
          ...s,
          crate: has
            ? s.crate.filter((t) => t !== trackId)
            : [...s.crate, trackId],
        };
      });
    },
    [patchSet],
  );

  /** Load a set into the engine. Restores its live plan if it has one. */
  const openSet = useCallback(
    (id: string) => {
      if (activeIdRef.current === id) return;
      // pause whatever was playing before we (maybe) switch engine implementations.
      activeEngineRef.current.pause();
      activeIdRef.current = id;
      const target = setsRef.current.find((s) => s.id === id);
      const crateTracks = library.filter((t) => target?.crate.includes(t.id) ?? false);
      setReprompts([]);
      // pick mock vs real for THIS set's pool, then drive the chosen engine.
      selectImplFor(crateTracks);
      const engine = activeEngineRef.current;
      if (target?.cueSheet) {
        engine.load(crateTracks);
        engine.play(target.cueSheet);
        engine.pause(); // restore paused; the workspace transport resumes it
        setIsPlaying(false);
      } else {
        setReport(null);
        setIsPlaying(false);
      }
    },
    [library, selectImplFor],
  );

  /** Spin a set: plan from its brief → cue sheet v1 → engine.play + reply. */
  const spin = useCallback(
    (id: string, brief: Brief) => {
      const target = setsRef.current.find((s) => s.id === id);
      const crateTracks = library.filter(
        (t) => target?.crate.includes(t.id) ?? false,
      );
      const pool = crateTracks.length > 0 ? crateTracks : library;

      // pause the previously-active engine, then pick mock vs real for this pool.
      activeEngineRef.current.pause();
      selectImplFor(pool);
      const engine = activeEngineRef.current;
      const conductor = activeConductorRef.current;

      engine.load(pool);
      const sheet = conductor.planSet(brief, pool);
      const reply = conductor.planMessage(brief, sheet);

      activeIdRef.current = id;
      setReprompts([]);
      patchSet(id, (s) => ({
        ...s,
        brief,
        cueSheet: sheet,
        chat: [
          ...s.chat,
          ...(brief.text.trim() ? [makeMessage("you", brief.text.trim())] : []),
          makeMessage("conductor", reply),
        ],
      }));

      engine.play(sheet);
      setIsPlaying(true);
    },
    [library, patchSet, selectImplFor],
  );

  const reprompt = useCallback(
    (id: string, label: string, text: string) => {
      const engine = activeEngineRef.current;
      const conductor = activeConductorRef.current;
      const target = setsRef.current.find((s) => s.id === id);
      const cur = target?.cueSheet ?? null;
      const rep = reportRef.current;
      if (!cur || !rep) return;

      const next = conductor.reprompt(text, rep, cur);
      const reply = conductor.steerMessage(text, rep, next);

      const evt: RepromptEvent = {
        id: `${next.version}-${Date.now()}`,
        label,
        fromVersion: cur.version,
        toVersion: next.version,
        status: "queued",
        atBar: rep.next_safe_edit_bar,
        ts: Date.now(),
      };
      setReprompts((prev) => [evt, ...prev].slice(0, 6));

      // log the steer + the conductor's reply immediately
      patchSet(id, (s) => ({
        ...s,
        chat: [...s.chat, makeMessage("you", text), makeMessage("conductor", reply)],
      }));

      // The edit "lands at the next phrase boundary": queued, then apply.
      window.setTimeout(() => {
        engine.update(next);
        patchSet(id, (s) => ({ ...s, cueSheet: next }));
        setReprompts((prev) =>
          prev.map((e) => (e.id === evt.id ? { ...e, status: "applied" } : e)),
        );
      }, 900);
    },
    [patchSet],
  );

  const togglePlay = useCallback(() => {
    const engine = activeEngineRef.current;
    if (engine.isPlaying()) {
      engine.pause();
      setIsPlaying(false);
    } else {
      engine.resume();
      setIsPlaying(true);
    }
  }, []);

  const seek = useCallback((bar: number) => {
    activeEngineRef.current.seek(bar);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      library,
      sets,
      report,
      isPlaying,
      micEnergy,
      reprompts,
      engine: activeEngineRef.current,
      conductor: activeConductorRef.current,
      engineMode,
      hasRealAudio,
      hasKey,
      refreshKey,
      micEnabled,
      enableMic,
      disableMic,
      addTracks,
      importPlaylistText,
      getSet,
      createSet,
      renameSet,
      deleteSet,
      updateBrief,
      toggleCrateTrack,
      openSet,
      spin,
      reprompt,
      togglePlay,
      seek,
    }),
    [
      library,
      sets,
      report,
      isPlaying,
      micEnergy,
      reprompts,
      engineMode,
      hasRealAudio,
      hasKey,
      refreshKey,
      micEnabled,
      enableMic,
      disableMic,
      addTracks,
      importPlaylistText,
      getSet,
      createSet,
      renameSet,
      deleteSet,
      updateBrief,
      toggleCrateTrack,
      openSet,
      spin,
      reprompt,
      togglePlay,
      seek,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export { fileToTrack };
