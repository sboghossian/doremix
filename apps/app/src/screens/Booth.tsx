import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/store/SessionContext";
import { EnergyCurve } from "@/components/EnergyCurve";
import { trackIndex, setLengthBars, barsToTime } from "@/lib/lookup";
import { clamp } from "@/lib/util";
import { Deck } from "./booth/Deck";
import { TransitionViz } from "./booth/TransitionViz";
import { CueSheetPanel } from "./booth/CueSheetPanel";
import { SteerPanel } from "./booth/SteerPanel";
import { RepromptLog } from "./booth/RepromptLog";
import { ExportModal } from "./booth/ExportModal";

const BARS_PER_TRACK = 64;

export function Booth() {
  const { cueSheet, report, library, isPlaying, togglePlay, seek, reprompts } = useSession();
  const navigate = useNavigate();
  const [exportOpen, setExportOpen] = useState(false);

  const index = useMemo(() => trackIndex(library), [library]);

  if (!cueSheet || !report) {
    return (
      <div className="mx-auto flex max-w-[900px] flex-col items-center px-5 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tightish">
          No set conducted yet
        </h1>
        <p className="mt-2 font-body text-sm text-mist">
          Brief Doremix and hit Conduct. The booth comes alive when there's a cue sheet to play.
        </p>
        <button
          onClick={() => navigate("/brief")}
          className="mt-6 rounded-lg bg-energy px-6 py-3 font-display text-base font-semibold text-ink"
        >
          Compose a set
        </button>
      </div>
    );
  }

  const lengthBars = setLengthBars(cueSheet);
  const now = report.now_bar;

  // Active transition object (if any).
  const activeTransition =
    cueSheet.transitions.find((t) => t.id === report.active_transition) ?? null;
  const transitionProgress = activeTransition
    ? clamp((now - activeTransition.start_bar) / activeTransition.duration_bars, 0, 1)
    : 0;

  // Map deck reports to slots; compute per-deck progress + gain.
  const deckA = report.decks.find((d) => d.slot === 1);
  const deckB = report.decks.find((d) => d.slot === 2);

  function cueTrackFor(slot: 1 | 2) {
    // the most recent cue-sheet track on this slot at/under now
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

  // During a transition, the outgoing deck gain dips while incoming rises.
  function gainFor(slot: 1 | 2, state: string | undefined) {
    if (!activeTransition) return state === "playing" ? 1 : 0.0;
    if (slot === activeTransition.from_deck) return 1 - transitionProgress * 0.9;
    if (slot === activeTransition.to_deck) return transitionProgress;
    return state === "playing" ? 1 : 0;
  }

  const rewriting = reprompts.some((r) => r.status === "queued");
  const remaining = barsToTime(report.time_remaining_in_set_bars, report.now_bpm);

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-5">
      {/* HERO: live energy curve */}
      <div className="panel mb-4 overflow-hidden">
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
          height={190}
        />
      </div>

      {/* Transport */}
      <div className="panel mb-4 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-energy text-ink transition-transform duration-150 ease-confident hover:scale-105"
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
          <div className="flex items-center gap-5 font-mono text-sm">
            <span className="text-mist">
              bar <span className="text-paper">{Math.round(now)}</span>
            </span>
            <span className="text-mist">
              bpm <span className="text-paper">{report.now_bpm.toFixed(1)}</span>
            </span>
            <span className="text-mist">
              left <span className="text-paper">{remaining}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-mist">
            buffer → bar {report.buffer_planned_until_bar}
          </span>
          <button onClick={() => setExportOpen(true)} className="btn-ghost text-sm">
            Export
          </button>
        </div>
      </div>

      {/* Decks + transition */}
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

      {/* Cue sheet + steer */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="h-[360px]">
          <CueSheetPanel sheet={cueSheet} report={report} index={index} rewriting={rewriting} />
        </div>
        <div className="flex flex-col gap-3">
          <SteerPanel />
          <RepromptLog events={reprompts} />
        </div>
      </div>

      <ExportModal sheet={cueSheet} open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
