import type { RepromptEvent } from "@/store/SessionContext";

/** Shows reprompts landing "at the next phrase boundary": queued → applied. */
export function RepromptLog({ events }: { events: RepromptEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="panel px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-wide text-mist/60">
          steer history — tap a quick prompt to re-plan the tail
        </span>
      </div>
    );
  }
  return (
    <div className="panel flex flex-col gap-1.5 px-4 py-3">
      {events.map((e) => (
        <div
          key={e.id}
          className="flex items-center justify-between gap-2 font-mono text-[11px]"
        >
          <span className="truncate text-paper">{e.label}</span>
          <span className="flex items-center gap-2 shrink-0">
            <span className="text-mist/60">
              v{e.fromVersion} → v{e.toVersion}
            </span>
            <span className="text-mist/50">@bar {e.atBar}</span>
            {e.status === "queued" ? (
              <span className="rounded bg-ink-3 px-1.5 py-0.5 text-energy2 animate-pulse-live">
                queued
              </span>
            ) : (
              <span className="rounded bg-ink-3 px-1.5 py-0.5 text-live">applied</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
