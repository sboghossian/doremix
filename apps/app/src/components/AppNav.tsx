import { NavLink } from "react-router-dom";
import { Wordmark } from "./Wordmark";
import { useSession } from "@/store/SessionContext";

const linkBase =
  "font-display text-sm px-3 py-1.5 rounded-lg transition-colors duration-150 ease-confident";

export function AppNav() {
  const { isPlaying, report } = useSession();
  return (
    <header className="sticky top-0 z-20 border-b border-ink-3 bg-ink/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-5">
        <NavLink to="/" className="shrink-0">
          <Wordmark className="text-base" />
        </NavLink>

        <nav className="flex items-center gap-1">
          {[
            { to: "/", label: "Library", end: true },
            { to: "/brief", label: "Brief", end: false },
            { to: "/booth", label: "Booth", end: false },
          ].map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `${linkBase} ${
                  isActive ? "bg-ink-2 text-paper" : "text-mist hover:text-paper"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

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
