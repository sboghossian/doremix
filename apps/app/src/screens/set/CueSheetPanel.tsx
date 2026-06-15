import { useState } from "react";
import type { CueSheet, StateReport, Track } from "@/types";

interface CueSheetPanelProps {
  sheet: CueSheet;
  report: StateReport;
  index: Map<string, Track>;
  /** versions newly written by reprompts, to flash the rewritten tail */
  rewriting: boolean;
}

interface Row {
  bar: number;
  kind: "track" | "transition";
  primary: string;
  secondary: string;
  frozen: boolean;
  now: boolean;
}

/** The machine voice — JetBrains Mono, collapsible. Shows the live cue sheet. */
export function CueSheetPanel({ sheet, report, index, rewriting }: CueSheetPanelProps) {
  const [open, setOpen] = useState(true);
  const now = report.now_bar;
  const safe = report.next_safe_edit_bar;

  const rows: Row[] = [];
  for (const t of sheet.tracks) {
    const tr = index.get(t.track_id);
    rows.push({
      bar: t.play_in_bar,
      kind: "track",
      primary: tr ? `${tr.artist} — ${tr.title}` : t.track_id,
      secondary: `${t.bpm}bpm ${t.key} · deck ${t.deck_slot === 1 ? "A" : "B"}`,
      frozen: t.play_in_bar < safe,
      now: now >= t.play_in_bar && now < t.play_in_bar + 64,
    });
  }
  for (const x of sheet.transitions) {
    rows.push({
      bar: x.start_bar,
      kind: "transition",
      primary: `↳ ${x.type}`,
      secondary: `${x.duration_bars} bars`,
      frozen: x.start_bar < safe,
      now: now >= x.start_bar && now <= x.start_bar + x.duration_bars,
    });
  }
  rows.sort((a, b) => a.bar - b.bar || (a.kind === "track" ? -1 : 1));

  return (
    <div className="glass flex h-full flex-col overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between border-b border-white/10 px-4 py-3"
      >
        <span className="font-mono text-[11px] uppercase tracking-wide text-mist">
          cue sheet {open ? "" : "(collapsed)"}
        </span>
        <span
          className={`font-mono text-[11px] ${
            rewriting ? "text-amber animate-pulse-live" : "text-paper"
          }`}
        >
          v{sheet.version}
          {rewriting && <span className="ml-1 text-mist">rewriting…</span>}
        </span>
      </button>

      {open && (
        <>
          <div className="flex-1 overflow-y-auto px-3 py-2 scroll-thin">
            <ul className="space-y-0.5">
              {rows.map((r, i) => (
                <li
                  key={`${r.kind}-${r.bar}-${i}`}
                  className={`flex items-baseline gap-2 rounded px-2 py-1 font-mono text-[11px] ${
                    r.now
                      ? "bg-white/10 text-paper"
                      : r.frozen
                        ? "text-mist/45"
                        : rewriting
                          ? "text-amber/90"
                          : "text-mist"
                  }`}
                >
                  <span className="w-12 shrink-0 tabular-nums text-mist/60">
                    {Math.round(r.bar)}
                  </span>
                  <span
                    className={`flex-1 truncate ${
                      r.kind === "transition" ? "pl-3 text-teal/90" : "text-paper/90"
                    } ${r.frozen ? "opacity-60" : ""}`}
                  >
                    {r.primary}
                  </span>
                  <span className="shrink-0 text-mist/60">{r.secondary}</span>
                  {r.now && <span className="shrink-0 text-live">●</span>}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-white/10 px-4 py-2 font-mono text-[10px] text-mist">
            valid_from_bar {Math.round(sheet.valid_from_bar)} · frozen floor · safe edit ≥{" "}
            {report.next_safe_edit_bar}
          </div>
        </>
      )}
    </div>
  );
}
