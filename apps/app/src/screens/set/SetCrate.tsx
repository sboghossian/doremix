import { useState } from "react";
import { useSession } from "@/store/SessionContext";
import { TrackChips } from "@/components/TrackChips";
import { fmtDuration } from "@/data/mockLibrary";
import type { DoremixSet } from "@/types";

/** This set's crate — select which library tracks are in play. Collapsible. */
export function SetCrate({ set }: { set: DoremixSet }) {
  const { library, toggleCrateTrack } = useSession();
  const [open, setOpen] = useState(false);
  const inCrate = new Set(set.crate);

  return (
    <div className="glass overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-white/10 px-4 py-3"
      >
        <span className="font-mono text-[11px] uppercase tracking-wide text-mist">
          crate · {set.crate.length}/{library.length} tracks
        </span>
        <span className="font-mono text-xs text-mist">{open ? "hide" : "edit"}</span>
      </button>

      {open && (
        <ul className="max-h-[320px] overflow-y-auto p-2 scroll-thin">
          {library.map((t) => {
            const on = inCrate.has(t.id);
            return (
              <li key={t.id}>
                <button
                  onClick={() => toggleCrateTrack(set.id, t.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                    on ? "bg-white/8" : "bg-transparent opacity-50 hover:opacity-80"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                        on
                          ? "border-teal bg-teal/20 text-teal"
                          : "border-white/20 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display text-sm text-paper">{t.title}</p>
                      <p className="truncate font-body text-xs text-mist">
                        {t.artist} ·{" "}
                        <span className="font-mono">{fmtDuration(t.duration)}</span>
                      </p>
                    </div>
                  </div>
                  <TrackChips track={t} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
