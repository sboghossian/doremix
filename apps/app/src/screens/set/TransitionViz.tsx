import type { CueTransition } from "@/types";

interface TransitionVizProps {
  transition: CueTransition | null;
  /** 0..1 progress through the active transition window */
  progress: number;
}

const LABELS: Record<CueTransition["type"], string> = {
  bass_swap: "bass swap",
  filter_fade: "filter fade",
  cut: "cut",
  echo_out: "echo out",
  loop_roll: "loop roll",
};

/** The active blend between decks A and B, with a moving progress line. */
export function TransitionViz({ transition, progress }: TransitionVizProps) {
  const active = transition !== null;
  return (
    <div className="glass flex flex-col items-center justify-center px-3 py-4">
      <span className="font-mono text-[10px] uppercase tracking-wide text-mist">
        transition
      </span>
      <div className="my-2 flex items-center gap-2">
        <span className="font-mono text-xs text-mist">A</span>
        <div className="relative h-1 w-16 overflow-hidden rounded-full bg-white/10">
          {active && (
            <div
              className="absolute inset-y-0 left-0 bg-spectrum"
              style={{
                width: `${Math.round(progress * 100)}%`,
                transition: "width 120ms linear",
              }}
            />
          )}
        </div>
        <span className="font-mono text-xs text-mist">B</span>
      </div>
      <span className={`font-display text-sm ${active ? "text-spectrum" : "text-mist/50"}`}>
        {active && transition ? LABELS[transition.type] : "—"}
      </span>
      {active && transition && (
        <span className="mt-1 font-mono text-[10px] text-mist">
          {transition.duration_bars} bars
        </span>
      )}
    </div>
  );
}
