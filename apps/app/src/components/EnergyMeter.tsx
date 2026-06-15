interface EnergyMeterProps {
  value: number; // 0..1
  label?: string;
  bars?: number;
}

/** Live mic / room-energy meter — a row of bars that light up to `value`. */
export function EnergyMeter({ value, label = "ROOM ENERGY", bars = 16 }: EnergyMeterProps) {
  const lit = Math.round(value * bars);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-[3px]" aria-hidden="true">
        {Array.from({ length: bars }).map((_, i) => {
          const on = i < lit;
          const h = 6 + (i / bars) * 18;
          // color ramps across the spectrum as the row fills
          const hue = i / bars;
          const color =
            hue < 0.25
              ? "#FF2E97"
              : hue < 0.5
                ? "#FFB627"
                : hue < 0.75
                  ? "#2EE6C4"
                  : "#2EA8FF";
          return (
            <span
              key={i}
              style={{
                height: h,
                width: 4,
                background: on ? color : "rgba(255,255,255,0.1)",
                opacity: on ? 1 : 0.6,
                boxShadow: on ? `0 0 8px ${color}` : "none",
                transition: "background 90ms linear, opacity 90ms linear",
              }}
              className="rounded-[1px]"
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wide text-mist">
          {label}
        </span>
        <span className="font-mono text-[10px] text-mist">{Math.round(value * 100)}%</span>
      </div>
    </div>
  );
}
