import { useState } from "react";
import { useSession } from "@/store/SessionContext";
import { EnergyMeter } from "@/components/EnergyMeter";

const QUICK_PROMPTS: { label: string; text: string }[] = [
  { label: "Build energy", text: "build the energy, raise the arc" },
  { label: "Drop now", text: "drop now, hit the peak" },
  { label: "Cool it down", text: "cool it down, release the energy" },
  { label: "More vocals", text: "more vocals" },
  { label: "Instrumental", text: "go instrumental, no vocals" },
  { label: "Double-time", text: "double-time, harder, faster" },
  { label: "Extend this", text: "extend this, make it longer" },
  { label: "Surprise me", text: "surprise me" },
];

export function SteerPanel() {
  const { reprompt, micEnergy, isPlaying } = useSession();
  const [text, setText] = useState("");

  function sendFree() {
    const t = text.trim();
    if (!t) return;
    reprompt(t.length > 22 ? `${t.slice(0, 22)}…` : t, t);
    setText("");
  }

  return (
    <div className="panel flex flex-col gap-4 p-4">
      <div>
        <span className="mb-2 block font-mono text-[11px] uppercase tracking-wide text-mist">
          steer
        </span>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q.label}
              disabled={!isPlaying}
              onClick={() => reprompt(q.label, q.text)}
              className="rounded-full border border-ink-3 bg-ink-2 px-3 py-1.5 font-display text-xs text-paper transition-all duration-150 ease-confident hover:border-energy2/60 hover:bg-ink-3 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendFree()}
          disabled={!isPlaying}
          placeholder="keep it upbeat, save the big one for last…"
          className="flex-1 rounded-lg border border-ink-3 bg-ink px-3 py-2 font-body text-sm text-paper outline-none focus:border-mist/40 disabled:opacity-40"
        />
        <button
          onClick={sendFree}
          disabled={!isPlaying}
          className="rounded-lg bg-energy px-4 py-2 font-display text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Steer
        </button>
      </div>

      <div className="border-t border-ink-3 pt-3">
        <EnergyMeter value={micEnergy} />
      </div>
    </div>
  );
}
