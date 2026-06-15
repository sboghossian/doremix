import { useState } from "react";
import { useSession } from "@/store/SessionContext";
import {
  type AudiencePreset,
  type Brief,
  type DoremixSet,
  type EnergyArc,
  type SetRules,
} from "@/types";
import { arcSamples } from "@/lib/arc";

const AUDIENCES: { id: AudiencePreset; label: string }[] = [
  { id: "sunset_rooftop", label: "Sunset rooftop" },
  { id: "warehouse", label: "Warehouse" },
  { id: "dinner", label: "Dinner / lounge" },
  { id: "peak_club", label: "Peak club" },
  { id: "afterhours", label: "Afterhours" },
  { id: "beach", label: "Beach" },
];

const ARCS: { id: EnergyArc; label: string; hint: string }[] = [
  { id: "rising", label: "Rising", hint: "build steadily to the top" },
  { id: "wave", label: "Wave", hint: "ebb and flow, multiple peaks" },
  { id: "plateau_peak", label: "Plateau then peak", hint: "hold, then send it" },
];

const RULE_DEFS: { key: keyof SetRules; label: string }[] = [
  { key: "noVocalsAfterPeak", label: "No vocals after the peak" },
  { key: "harmonicOnly", label: "Harmonic mixing only" },
  { key: "noDoubleDrops", label: "No double drops" },
  { key: "longBlends", label: "Long blends (16 bars)" },
];

/** Mini arc preview — gradient spectrum line for the picker. */
function ArcPreview({ arc }: { arc: EnergyArc }) {
  const pts = arcSamples(arc, 24);
  const d = pts
    .map((e, i) => `${i === 0 ? "M" : "L"} ${(i / 24) * 100} ${(1 - e) * 40 + 2}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="h-10 w-full">
      <defs>
        <linearGradient id={`arc-prev-${arc}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF2E97" />
          <stop offset="50%" stopColor="#FFB627" />
          <stop offset="100%" stopColor="#2EA8FF" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke={`url(#arc-prev-${arc})`} strokeWidth={2.4} />
    </svg>
  );
}

/**
 * The compose state — vibe chat front and center to describe the night, with
 * structured chips (length, audience, arc, rules). "Spin it" → MockConductor
 * plans the set and it goes live in the same workspace view.
 */
export function Compose({ set }: { set: DoremixSet }) {
  const { updateBrief, spin, library } = useSession();
  const [text, setText] = useState(set.brief.text);
  const [lengthMin, setLengthMin] = useState(set.brief.lengthMin);
  const [audience, setAudience] = useState<AudiencePreset>(set.brief.audience);
  const [arc, setArc] = useState<EnergyArc>(set.brief.arc);
  const [rules, setRules] = useState<SetRules>(set.brief.rules);

  const crateCount = library.filter((t) => set.crate.includes(t.id)).length;

  function toggleRule(key: keyof SetRules) {
    setRules((r) => ({ ...r, [key]: !r[key] }));
  }

  function spinIt() {
    const brief: Brief = { text, lengthMin, audience, arc, rules };
    updateBrief(set.id, brief);
    spin(set.id, brief);
  }

  return (
    <div className="mx-auto max-w-[860px]">
      <h1 className="font-display text-3xl font-bold tracking-tightish text-spectrum md:text-4xl">
        Describe the night
      </h1>
      <p className="mt-2 font-body text-sm text-mist">
        Talk to it like you'd brief a DJ. {crateCount} tracks in this set's crate.
      </p>

      {/* vibe chat — the front-and-center text box */}
      <div className="glass mt-6 p-5 shadow-glow-violet">
        <label className="mb-2 block font-mono text-[11px] uppercase tracking-wide text-mist">
          The vibe
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="40-min sunset rooftop, build slow, no vocals after the peak"
          className="h-24 w-full resize-none rounded-glass border border-white/12 bg-black/30 p-3 font-body text-base text-paper outline-none focus:border-cyan/50 scroll-thin"
        />
      </div>

      {/* length */}
      <div className="glass mt-4 p-5">
        <div className="mb-2 flex items-center justify-between">
          <label className="font-mono text-[11px] uppercase tracking-wide text-mist">
            Set length
          </label>
          <span className="font-mono text-sm text-paper">{lengthMin} min</span>
        </div>
        <input
          type="range"
          min={15}
          max={120}
          step={5}
          value={lengthMin}
          onChange={(e) => setLengthMin(Number(e.target.value))}
          className="w-full"
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-mist">
          <span>15</span>
          <span>120 min</span>
        </div>
      </div>

      {/* audience */}
      <div className="glass mt-4 p-5">
        <label className="mb-3 block font-mono text-[11px] uppercase tracking-wide text-mist">
          Audience
        </label>
        <div className="flex flex-wrap gap-2">
          {AUDIENCES.map((a) => (
            <button
              key={a.id}
              onClick={() => setAudience(a.id)}
              className={`rounded-full px-3 py-1.5 font-display text-sm transition-all duration-150 ease-confident ${
                audience === a.id
                  ? "bg-spectrum bg-[length:200%_auto] text-ink shadow-glow-cyan animate-gradient-pan"
                  : "border border-white/12 bg-white/5 text-mist hover:text-paper"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* energy arc */}
      <div className="glass mt-4 p-5">
        <label className="mb-3 block font-mono text-[11px] uppercase tracking-wide text-mist">
          Energy arc
        </label>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {ARCS.map((a) => (
            <button
              key={a.id}
              onClick={() => setArc(a.id)}
              className={`rounded-glass border p-3 text-left transition-all duration-150 ease-confident ${
                arc === a.id
                  ? "border-cyan/60 bg-white/8 shadow-glow-cyan"
                  : "border-white/10 bg-white/[0.03] hover:border-white/25"
              }`}
            >
              <ArcPreview arc={a.id} />
              <p className="mt-2 font-display text-sm text-paper">{a.label}</p>
              <p className="font-body text-xs text-mist">{a.hint}</p>
            </button>
          ))}
        </div>
      </div>

      {/* rules */}
      <div className="glass mt-4 p-5">
        <label className="mb-3 block font-mono text-[11px] uppercase tracking-wide text-mist">
          Rules
        </label>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {RULE_DEFS.map((r) => {
            const on = rules[r.key];
            return (
              <button
                key={r.key}
                onClick={() => toggleRule(r.key)}
                className="flex items-center justify-between rounded-glass border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-white/8"
              >
                <span className="font-body text-sm text-paper">{r.label}</span>
                <span
                  className={`relative h-5 w-9 rounded-full transition-colors duration-150 ${
                    on ? "bg-teal" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all duration-150 ease-confident ${
                      on ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          onClick={spinIt}
          disabled={crateCount === 0}
          className="btn-spectrum px-8 py-3 text-base"
        >
          Spin it
        </button>
      </div>
    </div>
  );
}
