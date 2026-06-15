import type { Track } from "@/types";

/** Mono metadata chips — BPM / key / energy. The "machine voice". */
export function TrackChips({ track }: { track: Track }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="chip">{track.bpm} BPM</span>
      <span className="chip">{track.key}</span>
      <EnergyChip energy={track.energy} />
      {track.hasVocals && <span className="chip text-mist/80">VOX</span>}
    </div>
  );
}

export function EnergyChip({ energy }: { energy: number }) {
  const pct = Math.round(energy * 100);
  return (
    <span className="chip gap-2">
      <span className="relative inline-block h-1 w-10 overflow-hidden rounded-full bg-white/10">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-spectrum"
          style={{ width: `${pct}%` }}
        />
      </span>
      E{pct}
    </span>
  );
}
