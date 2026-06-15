import { useEffect, useRef, useState } from "react";
import { useSession } from "@/store/SessionContext";
import { EnergyMeter } from "@/components/EnergyMeter";
import type { ChatMessage } from "@/types";

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

/**
 * The vibe chat / steer panel — a live conversation with the conductor. You
 * describe and re-steer; the conductor replies with short lines. Quick-prompt
 * chips + free text + the animated mic ENERGY meter.
 */
export function VibeChat({ setId, chat }: { setId: string; chat: ChatMessage[] }) {
  const { reprompt, micEnergy, isPlaying } = useSession();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  function sendFree() {
    const t = text.trim();
    if (!t) return;
    reprompt(setId, t.length > 22 ? `${t.slice(0, 22)}…` : t, t);
    setText("");
  }

  return (
    <div className="glass flex h-full min-h-[360px] flex-col p-4">
      <span className="mb-3 block font-mono text-[11px] uppercase tracking-wide text-mist">
        vibe chat
      </span>

      {/* transcript */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto pr-1 scroll-thin">
        {chat.length === 0 && (
          <p className="font-body text-sm text-mist/70">
            Steer the set in plain language. The conductor rewrites the tail and tells
            you what it's doing.
          </p>
        )}
        {chat.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "you" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "you"
                  ? "bg-white/10 font-body text-paper"
                  : "border border-white/10 bg-spectrum/10 font-body text-paper"
              }`}
            >
              {m.role === "conductor" && (
                <span className="mb-0.5 block font-mono text-[9px] uppercase tracking-wide text-teal">
                  conductor
                </span>
              )}
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* quick prompts */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q.label}
            disabled={!isPlaying}
            onClick={() => reprompt(setId, q.label, q.text)}
            className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 font-display text-xs text-paper transition-all duration-150 ease-confident hover:border-cyan/60 hover:bg-white/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* free text */}
      <div className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendFree()}
          disabled={!isPlaying}
          placeholder="keep it upbeat, save the big one for last…"
          className="flex-1 rounded-glass border border-white/12 bg-black/30 px-3 py-2 font-body text-sm text-paper outline-none focus:border-cyan/50 disabled:opacity-40"
        />
        <button onClick={sendFree} disabled={!isPlaying} className="btn-spectrum px-4 py-2 text-sm">
          Steer
        </button>
      </div>

      <div className="mt-3 border-t border-white/10 pt-3">
        <EnergyMeter value={micEnergy} />
      </div>
    </div>
  );
}
