import { NavLink } from "react-router-dom";
import { Wordmark } from "./Wordmark";
import { useSession } from "@/store/SessionContext";

/**
 * The top bar. v2 is a project tool, not a 3-tab flow — so the nav is just the
 * wordmark (→ Your sets) plus a live/idle status pill.
 */
export function AppNav() {
  const { isPlaying, report } = useSession();
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-ink/60 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1480px] items-center justify-between px-5">
        <NavLink to="/" className="shrink-0">
          <Wordmark className="text-base" live={isPlaying} />
        </NavLink>

        <NavLink
          to="/"
          className="font-display text-sm text-mist transition-colors hover:text-paper"
        >
          Your sets
        </NavLink>

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
    </header>
  );
}
