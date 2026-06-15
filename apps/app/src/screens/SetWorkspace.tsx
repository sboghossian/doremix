import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSession } from "@/store/SessionContext";
import { EnergyCurve } from "@/components/EnergyCurve";
import { trackIndex, setLengthBars, barsToTime } from "@/lib/lookup";
import { clamp } from "@/lib/util";
import { Compose } from "./set/Compose";
import { Deck } from "./set/Deck";
import { TransitionViz } from "./set/TransitionViz";
import { CueSheetPanel } from "./set/CueSheetPanel";
import { VibeChat } from "./set/VibeChat";
import { SetCrate } from "./set/SetCrate";
import { ExportModal } from "./set/ExportModal";

const BARS_PER_TRACK = 64;

/** Inline-editable set name + vibe line in the workspace header. */
function SetHeader({
  setId,
  name,
  vibe,
}: {
  setId: string;
  name: string;
  vibe: string;
}) {
  const { renameSet } = useSession();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  useEffect(() => setDraft(name), [name]);

  return (
    <div className="min-w-0">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            renameSet(setId, draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              renameSet(setId, draft);
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full max-w-md rounded-lg border border-white/15 bg-white/5 px-2 py-1 font-display text-2xl font-bold text-paper outline-none focus:border-cyan/60"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="truncate text-left font-display text-2xl font-bold tracking-tightish text-paper hover:text-spectrum"
          title="Click to rename"
        >
          {name}
        </button>
      )}
      <p className="truncate font-body text-sm text-mist">
        {vibe.trim() || "no vibe line yet"}
      </p>
    </div>
  );
}

export function SetWorkspace() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const {
    getSet,
    openSet,
    library,
    report,
    isPlaying,
    togglePlay,
    seek,
    reprompts,
  } = useSession();
  const [exportOpen, setExportOpen] = useState(false);

  // Load this set into the engine whenever the id changes.
  useEffect(() => {
    if (id) openSet(id);
  }, [id, openSet]);

  const set = getSet(id);
  const index = useMemo(() => trackIndex(library), [library]);

  if (!set) {
    return (
      <div className="mx-auto flex max-w-[900px] flex-col items-center px-5 py-24 text-center">
        <h1 className="font-display text-2xl font-bold text-paper">Set not found</h1>
        <button onClick={() => navigate("/")} className="btn-spectrum mt-6 px-6 py-3 text-base">
          Back to your sets
        </button>
      </div>
    );
  }

  const cueSheet = set.cueSheet;

  // COMPOSE state — no plan yet.
  if (!cueSheet) {
    return (
      <div className="mx-auto max-w-[1480px] px-5 py-8">
        <button
          onClick={() => navigate("/")}
          className="mb-6 font-mono text-xs text-mist hover:text-paper"
        >
          ← your sets
        </button>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <Compose set={set} />
          <div className="lg:pt-24">
            <SetCrate set={set} />
          </div>
        </div>
      </div>
    );
  }

  // Spun, but the engine's first state report hasn't flushed yet (one frame).
  if (!report) {
    return (
      <div className="mx-auto flex max-w-[900px] flex-col items-center px-5 py-24 text-center">
        <span className="font-mono text-xs uppercase tracking-wide text-mist animate-pulse-live">
          loading the booth…
        </span>
      </div>
    );
  }

  // LIVE state — the one living canvas.
  const lengthBars = setLengthBars(cueSheet);
  const now = report.now_bar;

  const activeTransition =
    cueSheet.transitions.find((t) => t.id === report.active_transition) ?? null;
  const transitionProgress = activeTransition
    ? clamp((now - activeTransition.start_bar) / activeTransition.duration_bars, 0, 1)
    : 0;

  const deckA = report.decks.find((d) => d.slot === 1);
  const deckB = report.decks.find((d) => d.slot === 2);

  function cueTrackFor(slot: 1 | 2) {
    const candidates = cueSheet!.tracks
      .filter((t) => t.deck_slot === slot && t.play_in_bar <= now + BARS_PER_TRACK)
      .sort((a, b) => b.play_in_bar - a.play_in_bar);
    return candidates[0];
  }

  const cueA = cueTrackFor(1);
  const cueB = cueTrackFor(2);

  function progressFor(slot: 1 | 2) {
    const ct = slot === 1 ? cueA : cueB;
    if (!ct) return 0;
    return clamp((now - ct.play_in_bar) / BARS_PER_TRACK, 0, 1);
  }

  function gainFor(slot: 1 | 2, state: string | undefined) {
    if (!activeTransition) return state === "playing" ? 1 : 0.0;
    if (slot === activeTransition.from_deck) return 1 - transitionProgress * 0.9;
    if (slot === activeTransition.to_deck) return transitionProgress;
    return state === "playing" ? 1 : 0;
  }

  const rewriting = reprompts.some((r) => r.status === "queued");
  const remaining = barsToTime(report.time_remaining_in_set_bars, report.now_bpm);

  return (
    <div className="mx-auto max-w-[1480px] px-5 py-5">
      {/* header + transport */}
      <div className="glass mb-4 flex flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="shrink-0 font-mono text-xs text-mist hover:text-paper"
          >
            ←
          </button>
          <SetHeader setId={set.id} name={set.name} vibe={set.brief.text} />
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-spectrum bg-[length:200%_auto] text-ink shadow-glow-magenta transition-transform duration-150 ease-confident hover:scale-105 animate-gradient-pan"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="2" width="4" height="12" rx="1" />
                <rect x="9" y="2" width="4" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2.5v11l9-5.5-9-5.5z" />
              </svg>
            )}
          </button>
          <div className="flex items-center gap-4 font-mono text-sm">
            <span className="text-mist">
              bar <span className="text-paper">{Math.round(now)}</span>
            </span>
            <span className="text-mist">
              bpm <span className="text-paper">{report.now_bpm.toFixed(1)}</span>
            </span>
            <span className="text-mist">
              left <span className="text-paper">{remaining}</span>
            </span>
            <span className="hidden text-mist md:inline">
              buf <span className="text-paper">→{report.buffer_planned_until_bar}</span>
            </span>
          </div>
          <button onClick={() => setExportOpen(true)} className="btn-ghost text-sm">
            Render
          </button>
        </div>
      </div>

      {/* HERO: the big glowing energy curve */}
      <div
        className={`glass mb-4 overflow-hidden ${isPlaying ? "shadow-glow-cyan" : ""}`}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="font-mono text-[11px] uppercase tracking-wide text-mist">
            energy · whole set
          </span>
          <span className="font-mono text-[11px] text-mist">
            bar {Math.round(now)} / {lengthBars}
          </span>
        </div>
        <EnergyCurve
          sheet={cueSheet}
          nowBar={now}
          lengthBars={lengthBars}
          onSeek={seek}
          live={isPlaying}
          height={200}
        />
      </div>

      {/* decks + transition */}
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_160px_1fr]">
        <Deck
          slot={1}
          report={deckA}
          cueTrack={cueA}
          track={cueA ? index.get(cueA.track_id) : undefined}
          progress={progressFor(1)}
          gain={gainFor(1, deckA?.state)}
        />
        <TransitionViz transition={activeTransition} progress={transitionProgress} />
        <Deck
          slot={2}
          report={deckB}
          cueTrack={cueB}
          track={cueB ? index.get(cueB.track_id) : undefined}
          progress={progressFor(2)}
          gain={gainFor(2, deckB?.state)}
        />
      </div>

      {/* vibe chat + cue sheet + crate */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.1fr]">
        <VibeChat setId={set.id} chat={set.chat} />
        <div className="flex flex-col gap-4">
          <div className="h-[300px]">
            <CueSheetPanel
              sheet={cueSheet}
              report={report}
              index={index}
              rewriting={rewriting}
            />
          </div>
          <SetCrate set={set} />
        </div>
      </div>

      <ExportModal sheet={cueSheet} open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
