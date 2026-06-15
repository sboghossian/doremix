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
          // color ramps with the gradient across the row
          const hue = i / bars;
          const color =
            hue < 0.5 ? "#FF3D81" : hue < 0.8 ? "#FF9F1C" : "#2EC4B6";
          return (
            <span
              key={i}
              style={{
                height: h,
                width: 4,
                background: on ? color : "#1E1E28",
                opacity: on ? 1 : 0.6,
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
