import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/store/SessionContext";
import {
  DEFAULT_RULES,
  type AudiencePreset,
  type Brief as BriefT,
  type EnergyArc,
  type SetRules,
} from "@/types";

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

/** Sketch of the selected arc — a tiny gradient curve preview. */
function ArcPreview({ arc }: { arc: EnergyArc }) {
  const pts: number[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    let e = 0.5;
    if (arc === "rising") e = 0.3 + 0.6 * t;
    else if (arc === "wave") e = 0.5 + 0.32 * Math.sin(t * Math.PI * 2 - Math.PI / 2);
    else e = t < 0.55 ? 0.32 + 0.45 * (t / 0.55) : t < 0.8 ? 0.8 : 0.95 - 0.5 * ((t - 0.8) / 0.2);
    pts.push(Math.max(0.05, Math.min(1, e)));
  }
  const d = pts
    .map((e, i) => `${i === 0 ? "M" : "L"} ${(i / 24) * 100} ${(1 - e) * 40 + 2}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 44" preserveAspectRatio="none" className="h-10 w-full">
      <defs>
        <linearGradient id="arc-prev" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF3D81" />
          <stop offset="50%" stopColor="#FF9F1C" />
          <stop offset="100%" stopColor="#2EC4B6" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="url(#arc-prev)" strokeWidth={2} />
    </svg>
  );
}

export function Brief() {
  const { conduct, library } = useSession();
  const navigate = useNavigate();

  const [text, setText] = useState("");
  const [lengthMin, setLengthMin] = useState(40);
  const [audience, setAudience] = useState<AudiencePreset>("sunset_rooftop");
  const [arc, setArc] = useState<EnergyArc>("plateau_peak");
  const [rules, setRules] = useState<SetRules>(DEFAULT_RULES);

  function toggleRule(key: keyof SetRules) {
    setRules((r) => ({ ...r, [key]: !r[key] }));
  }

  function onConduct() {
    const brief: BriefT = { text, lengthMin, audience, arc, rules };
    conduct(brief);
    navigate("/booth");
  }

  const analyzed = library.filter((t) => t.analyzed).length;

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tightish">
        Compose the set
      </h1>
      <p className="mt-1 font-body text-sm text-mist">
        Talk to it like you'd brief a DJ. {analyzed} tracks ready to draw from.
      </p>

      {/* Chat-style description */}
      <div className="mt-6 panel p-5">
        <label className="mb-2 block font-mono text-[11px] uppercase tracking-wide text-mist">
          Describe the vibe
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="40-min sunset rooftop, build slow, no vocals after the peak"
          className="h-24 w-full resize-none rounded-lg border border-ink-3 bg-ink p-3 font-body text-sm text-paper outline-none focus:border-mist/40 scroll-thin"
        />
      </div>

      {/* Length */}
      <div className="mt-4 panel p-5">
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

      {/* Audience presets */}
      <div className="mt-4 panel p-5">
        <label className="mb-3 block font-mono text-[11px] uppercase tracking-wide text-mist">
          Audience
        </label>
        <div className="flex flex-wrap gap-2">
          {AUDIENCES.map((a) => (
            <button
              key={a.id}
              onClick={() => setAudience(a.id)}
              className={`rounded-full px-3 py-1.5 font-display text-sm transition-colors duration-150 ease-confident ${
                audience === a.id
                  ? "bg-paper text-ink"
                  : "border border-ink-3 bg-ink-2 text-mist hover:text-paper"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Energy arc */}
      <div className="mt-4 panel p-5">
        <label className="mb-3 block font-mono text-[11px] uppercase tracking-wide text-mist">
          Energy arc
        </label>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {ARCS.map((a) => (
            <button
              key={a.id}
              onClick={() => setArc(a.id)}
              className={`rounded-lg border p-3 text-left transition-colors duration-150 ease-confident ${
                arc === a.id
                  ? "border-energy2 bg-ink-2"
                  : "border-ink-3 bg-ink-2/40 hover:border-mist/40"
              }`}
            >
              <ArcPreview arc={a.id} />
              <p className="mt-2 font-display text-sm text-paper">{a.label}</p>
              <p className="font-body text-xs text-mist">{a.hint}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Rules */}
      <div className="mt-4 panel p-5">
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
                className="flex items-center justify-between rounded-lg border border-ink-3 bg-ink-2/40 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-ink-2"
              >
                <span className="font-body text-sm text-paper">{r.label}</span>
                <span
                  className={`relative h-5 w-9 rounded-full transition-colors duration-150 ${
                    on ? "bg-energy3" : "bg-ink-3"
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

      <div className="mt-6 flex items-center justify-between">
        <button onClick={() => navigate("/")} className="btn-ghost text-sm">
          Back to library
        </button>
        <button
          onClick={onConduct}
          disabled={analyzed === 0}
          className="rounded-lg bg-energy px-6 py-3 font-display text-base font-semibold text-ink transition-transform duration-150 ease-confident hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Conduct
        </button>
      </div>
    </div>
  );
}
