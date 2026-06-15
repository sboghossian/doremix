import type { CueTrack, DeckReport, Track } from "@/types";
import { Waveform } from "@/components/Waveform";
import { hashStr } from "@/lib/util";

interface DeckProps {
  slot: 1 | 2;
  report: DeckReport | undefined;
  cueTrack: CueTrack | undefined;
  track: Track | undefined;
  /** 0..1 progress through this track */
  progress: number;
  /** gain 0..1 (1 = full, dips during transition) */
  gain: number;
}

/** A glassy deck card. The playing deck gets a colored glow ring. */
export function Deck({ slot, report, cueTrack, track, progress, gain }: DeckProps) {
  const playing = report?.state === "playing";
  const cued = report?.state === "cued";
  const seed = hashStr(track?.id ?? `deck-${slot}`);

  return (
    <div
      className={`glass relative overflow-hidden p-4 transition-shadow duration-200 ${
        playing ? "shadow-glow-magenta" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wide text-mist">
            Deck {slot === 1 ? "A" : "B"}
          </span>
          {playing && (
            <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-live">
              <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
              playing
            </span>
          )}
          {cued && (
            <span className="font-mono text-[10px] uppercase tracking-wide text-amber">
              cued
            </span>
          )}
          {!report && (
            <span className="font-mono text-[10px] uppercase tracking-wide text-mist/50">
              empty
            </span>
          )}
        </div>
        {cueTrack && (
          <span className="font-mono text-[11px] text-mist">
            {cueTrack.bpm} BPM · {cueTrack.key}
          </span>
        )}
      </div>

      {track ? (
        <>
          <p className="truncate font-display text-base font-medium text-paper">
            {track.title}
          </p>
          <p className="mb-3 truncate font-body text-xs text-mist">{track.artist}</p>
          <Waveform seed={seed} progress={playing ? progress : 0} active={playing} height={52} />

          {/* gain / level */}
          <div className="mt-3 flex items-center gap-3">
            <span className="font-mono text-[10px] uppercase text-mist">gain</span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`absolute inset-y-0 left-0 rounded-full ${
                  playing ? "bg-spectrum" : "bg-white/30"
                }`}
                style={{
                  width: `${Math.round(gain * 100)}%`,
                  transition: "width 120ms linear",
                }}
              />
            </div>
            <span className="w-9 text-right font-mono text-[10px] text-mist">
              {Math.round(gain * 100)}%
            </span>
          </div>
        </>
      ) : (
        <div className="flex h-[120px] items-center justify-center">
          <span className="font-mono text-xs text-mist/50">— no track staged —</span>
        </div>
      )}
    </div>
  );
}
