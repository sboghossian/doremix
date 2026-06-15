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
import { MOCK_LIBRARY } from "@/data/mockLibrary";
import { hashStr, shortId } from "@/lib/util";
import { loadSets, newSetId, saveSets } from "./setsStorage";

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

/** Turn dropped filenames into plausible analyzed tracks. */
function fileToTrack(name: string): Track {
  const clean = name.replace(/\.(mp3|wav|flac|m4a|aiff|ogg)$/i, "");
  const parts = clean.split(/\s+-\s+/);
  const artist = parts.length > 1 ? parts[0] : "Unknown";
  const title = parts.length > 1 ? parts.slice(1).join(" - ") : clean;
  const seed = hashStr(clean);
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
  return {
    id: `lib:${(seed >>> 0).toString(16).slice(0, 5)}`,
    title,
    artist,
    genre: genres[seed % genres.length],
    bpm: 120 + (seed % 9),
    key: keysA[seed % keysA.length],
    energy: 0.3 + ((seed >> 4) % 70) / 100,
    duration: 300 + ((seed >> 8) % 200),
    analyzed: true,
    hasVocals: (seed & 1) === 0,
  };
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
  const engineRef = useRef<Engine>(new MockEngine());
  const conductorRef = useRef<Conductor>(new MockConductor());

  const [library, setLibrary] = useState<Track[]>(MOCK_LIBRARY);
  const [sets, setSets] = useState<DoremixSet[]>(() => sortByTouched(loadSets()));
  const [report, setReport] = useState<StateReport | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [micEnergy, setMicEnergy] = useState(0.3);
  const [reprompts, setReprompts] = useState<RepromptEvent[]>([]);

  /** the set currently loaded into the engine */
  const activeIdRef = useRef<string | null>(null);
  const setsRef = useRef<DoremixSet[]>(sets);
  const reportRef = useRef<StateReport | null>(null);

  useEffect(() => {
    setsRef.current = sets;
  }, [sets]);
  useEffect(() => {
    reportRef.current = report;
  }, [report]);

  // Persist sets to localStorage on every change.
  useEffect(() => {
    saveSets(sets);
  }, [sets]);

  // Subscribe to engine state reports.
  useEffect(() => {
    const engine = engineRef.current;
    const off = engine.on((r) => {
      setReport(r);
      setIsPlaying(engine.isPlaying());
      setMicEnergy(engine.micEnergy());
    });
    return () => {
      off();
      engine.dispose();
    };
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

  const addTracks = useCallback((tracks: Track[]) => {
    setLibrary((prev) => {
      const seen = new Set(prev.map((t) => t.id));
      const fresh = tracks.filter((t) => !seen.has(t.id));
      return [...prev, ...fresh];
    });
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
      engineRef.current.pause();
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
      activeIdRef.current = id;
      const target = setsRef.current.find((s) => s.id === id);
      const engine = engineRef.current;
      setReprompts([]);
      if (target?.cueSheet) {
        const crateTracks = library.filter((t) => target.crate.includes(t.id));
        engine.load(crateTracks);
        engine.play(target.cueSheet);
        engine.pause(); // restore paused; the workspace transport resumes it
        setIsPlaying(false);
      } else {
        engine.pause();
        setReport(null);
        setIsPlaying(false);
      }
    },
    [library],
  );

  /** Spin a set: plan from its brief → cue sheet v1 → engine.play + reply. */
  const spin = useCallback(
    (id: string, brief: Brief) => {
      const engine = engineRef.current;
      const conductor = conductorRef.current;
      const target = setsRef.current.find((s) => s.id === id);
      const crateTracks = library.filter(
        (t) => target?.crate.includes(t.id) ?? false,
      );
      const pool = crateTracks.length > 0 ? crateTracks : library;

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
    [library, patchSet],
  );

  const reprompt = useCallback(
    (id: string, label: string, text: string) => {
      const engine = engineRef.current;
      const conductor = conductorRef.current;
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
    const engine = engineRef.current;
    if (engine.isPlaying()) {
      engine.pause();
      setIsPlaying(false);
    } else {
      engine.resume();
      setIsPlaying(true);
    }
  }, []);

  const seek = useCallback((bar: number) => {
    engineRef.current.seek(bar);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      library,
      sets,
      report,
      isPlaying,
      micEnergy,
      reprompts,
      engine: engineRef.current,
      conductor: conductorRef.current,
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
