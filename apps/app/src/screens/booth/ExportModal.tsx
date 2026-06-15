import { useEffect, useState } from "react";
import type { CueSheet } from "@/types";

interface ExportModalProps {
  sheet: CueSheet;
  open: boolean;
  onClose: () => void;
}

type Phase = "idle" | "rendering" | "done";

export function ExportModal({ sheet, open, onClose }: ExportModalProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setPct(0);
    }
  }, [open]);

  useEffect(() => {
    if (phase !== "rendering") return;
    const t = setInterval(() => {
      setPct((p) => {
        const next = p + 4 + Math.random() * 7;
        if (next >= 100) {
          clearInterval(t);
          setPhase("done");
          return 100;
        }
        return next;
      });
    }, 120);
    return () => clearInterval(t);
  }, [phase]);

  function downloadCueSheet() {
    const blob = new Blob([JSON.stringify(sheet, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sheet.plan_id.replace(/[:]/g, "-")}.cue.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold tracking-tightish">
            Render set
          </h2>
          <button onClick={onClose} className="font-mono text-xs text-mist hover:text-paper">
            esc
          </button>
        </div>
        <p className="mb-5 font-body text-sm text-mist">
          {sheet.tracks.length} tracks · v{sheet.version} cue sheet. Audio renders locally —
          nothing uploads.
        </p>

        {phase === "idle" && (
          <button
            onClick={() => setPhase("rendering")}
            className="w-full rounded-lg bg-energy py-3 font-display text-base font-semibold text-ink transition-transform duration-150 ease-confident hover:scale-[1.01]"
          >
            Render
          </button>
        )}

        {phase === "rendering" && (
          <div>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-ink-3">
              <div
                className="h-full bg-energy"
                style={{ width: `${pct}%`, transition: "width 120ms linear" }}
              />
            </div>
            <p className="font-mono text-[11px] text-mist">
              bouncing… {Math.round(pct)}%
            </p>
          </div>
        )}

        {phase === "done" && (
          <div className="animate-fade-in">
            <p className="mb-4 flex items-center gap-2 font-mono text-xs text-live">
              <span className="h-1.5 w-1.5 rounded-full bg-live" /> render complete
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={downloadCueSheet}
                className="w-full rounded-lg bg-energy py-2.5 font-display text-sm font-semibold text-ink"
              >
                Download cue sheet (.json)
              </button>
              <button
                disabled
                title="WAV bounce is wired to the real engine in v0 — stubbed in this prototype"
                className="w-full cursor-not-allowed rounded-lg border border-ink-3 bg-ink-2 py-2.5 font-display text-sm text-mist/60"
              >
                Download set.wav — needs real engine
              </button>
              <p className="mt-1 font-body text-[11px] text-mist/70">
                The cue sheet is the real, reloadable contract. The WAV bounce arrives when the
                Web Audio engine replaces the mock.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
