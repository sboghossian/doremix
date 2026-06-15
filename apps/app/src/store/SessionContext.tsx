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
import type { Brief, CueSheet, PlaylistMatch, StateReport, Track } from "@/types";
import { MockConductor, MockEngine } from "@/core";
import type { Conductor, Engine } from "@/core";
import { MOCK_LIBRARY } from "@/data/mockLibrary";
import { hashStr } from "@/lib/util";

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
  library: Track[];
  brief: Brief | null;
  cueSheet: CueSheet | null;
  report: StateReport | null;
  isPlaying: boolean;
  micEnergy: number;
  reprompts: RepromptEvent[];

  engine: Engine;
  conductor: Conductor;

  addTracks: (tracks: Track[]) => void;
  importPlaylistText: (text: string) => PlaylistMatch[];
  conduct: (brief: Brief) => void;
  reprompt: (label: string, text: string) => void;
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

export function SessionProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<Engine>(new MockEngine());
  const conductorRef = useRef<Conductor>(new MockConductor());

  const [library, setLibrary] = useState<Track[]>(MOCK_LIBRARY);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [cueSheet, setCueSheet] = useState<CueSheet | null>(null);
  const [report, setReport] = useState<StateReport | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [micEnergy, setMicEnergy] = useState(0.3);
  const [reprompts, setReprompts] = useState<RepromptEvent[]>([]);

  const cueSheetRef = useRef<CueSheet | null>(null);
  const reportRef = useRef<StateReport | null>(null);

  useEffect(() => {
    cueSheetRef.current = cueSheet;
  }, [cueSheet]);
  useEffect(() => {
    reportRef.current = report;
  }, [report]);

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
              t.title.toLowerCase().split(" ").some((w) => w.length > 3 && q.includes(w))
            );
          }) ?? null;
        return { query, matched };
      });
    },
    [library],
  );

  const conduct = useCallback(
    (b: Brief) => {
      setBrief(b);
      const engine = engineRef.current;
      const conductor = conductorRef.current;
      engine.load(library);
      const sheet = conductor.planSet(b, library);
      setCueSheet(sheet);
      setReprompts([]);
      engine.play(sheet);
      setIsPlaying(true);
    },
    [library],
  );

  const reprompt = useCallback((label: string, text: string) => {
    const engine = engineRef.current;
    const conductor = conductorRef.current;
    const cur = cueSheetRef.current;
    const rep = reportRef.current;
    if (!cur || !rep) return;

    const next = conductor.reprompt(text, rep, cur);
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

    // The edit "lands at the next phrase boundary": show queued, then apply.
    window.setTimeout(() => {
      engine.update(next);
      setCueSheet(next);
      setReprompts((prev) =>
        prev.map((e) => (e.id === evt.id ? { ...e, status: "applied" } : e)),
      );
    }, 900);
  }, []);

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
      brief,
      cueSheet,
      report,
      isPlaying,
      micEnergy,
      reprompts,
      engine: engineRef.current,
      conductor: conductorRef.current,
      addTracks,
      importPlaylistText,
      conduct,
      reprompt,
      togglePlay,
      seek,
    }),
    [
      library,
      brief,
      cueSheet,
      report,
      isPlaying,
      micEnergy,
      reprompts,
      addTracks,
      importPlaylistText,
      conduct,
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
