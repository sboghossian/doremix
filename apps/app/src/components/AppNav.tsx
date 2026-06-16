import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Wordmark } from "./Wordmark";
import { SettingsModal } from "./SettingsModal";
import { useSession } from "@/store/SessionContext";

/**
 * The top bar. v2 is a project tool, not a 3-tab flow — so the nav is the
 * wordmark (→ Your sets), a demo/live mode pill, a settings (BYO key) button,
 * and the live/idle status pill.
 */
export function AppNav() {
  const { isPlaying, report, engineMode, hasKey, refreshKey } = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const live = engineMode === "live";

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-ink/60 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between px-5">
        <NavLink to="/" className="shrink-0">
          <Wordmark className="text-base" live={isPlaying} />
        </NavLink>

        <div className="flex items-center gap-4">
          <NavLink
            to="/"
            className="font-display text-sm text-mist transition-colors hover:text-paper"
          >
            Your sets
          </NavLink>

          {/* demo / live mode pill */}
          <span
            title={
              live
                ? "Live mode: real audio + your OpenRouter key drive the engine."
                : "Demo mode: seeded example tracks on the mock engine. Add real tracks + a key to go live."
            }
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide sm:inline-flex ${
              live
                ? "border-live/40 bg-live/10 text-live"
                : "border-white/12 bg-white/5 text-mist"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${live ? "bg-live" : "bg-mist/50"}`}
            />
            {live ? "Live" : "Demo"}
          </span>

          {/* settings / BYO key */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={`btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs ${
              hasKey ? "" : "text-amber"
            }`}
            title={hasKey ? "Conductor key set" : "Set your OpenRouter key"}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            Key
          </button>
        </div>

        <div className="flex w-[120px] items-center justify-end gap-2">
          {isPlaying ? (
            <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-live">
              <span className="h-1.5 w-1.5 rounded-full bg-live animate-pulse-live" />
              Live
            </span>
          ) : report ? (
            <span className="font-mono text-[11px] uppercase tracking-wide text-mist">
              Paused
            </span>
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-wide text-mist/60">
              Idle
            </span>
          )}
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={refreshKey}
      />
    </header>
  );
}
