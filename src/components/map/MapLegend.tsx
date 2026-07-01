"use client";

import { useStore } from "@/core/state/store";
import { GDELT_TONE_BANDS } from "@/config/marker-style";

/** Contextual legends/controls that appear only while a relevant layer is on. */
export function MapLegend() {
  const enabled = useStore((s) => s.enabled);
  const eqWindowDays = useStore((s) => s.eqWindowDays);
  const setEqWindow = useStore((s) => s.setEqWindow);

  const showTone = !!enabled["conflict-events"];
  const showEq = !!enabled["earthquakes"];
  if (!showTone && !showEq) return null;

  return (
    <div className="absolute left-3 top-3 z-20 flex max-w-[220px] flex-col gap-2">
      {showEq && (
        <div className="pan-glass pan-notch-tr px-2.5 py-2">
          <div className="label-caps text-[var(--color-outline)]">M2.5+ WINDOW</div>
          <div className="mt-1.5 flex gap-1 min-w-[150px]">
            {([1, 7] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setEqWindow(d)}
                aria-pressed={eqWindowDays === d}
                className={`flex-1 border px-2 py-1 font-mono text-[10px] font-bold tracking-[0.1em] transition-colors ${
                  eqWindowDays === d
                    ? "border-[var(--color-intel)] text-[var(--color-intel)]"
                    : "border-[var(--color-outline-variant)] text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
                }`}
              >
                {d === 1 ? "1 DAY" : "7 DAYS"}
              </button>
            ))}
          </div>
        </div>
      )}

      {showTone && (
        <div className="pointer-events-none pan-glass pan-notch-tr px-2.5 py-2">
          <div className="label-caps text-[var(--color-outline)]">MEDIA TONE (GDELT)</div>
          <ul className="mt-1.5 space-y-1">
            {GDELT_TONE_BANDS.map((b, i) => {
              const next = GDELT_TONE_BANDS[i + 1];
              const range =
                b.min === -Infinity
                  ? `< ${next.min}`
                  : next
                    ? `${b.min} to ${next.min}`
                    : `≥ ${b.min}`;
              return (
                <li key={b.label} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0"
                    style={{ background: b.color }}
                  />
                  <span className="flex-1 font-mono text-[10px] text-[var(--color-on-surface)]">
                    {b.label}
                  </span>
                  <span className="code-data text-[var(--color-outline)]">{range}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-1.5 text-[9px] leading-tight text-[var(--color-on-surface-variant)]">
            Sentiment of coverage, not severity. Range ≈ −15…+10.
          </div>
        </div>
      )}
    </div>
  );
}
