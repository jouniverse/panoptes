"use client";

import { useEffect } from "react";
import { useStore } from "@/core/state/store";

const WINDOWS = [
  { label: "1H", ms: 60 * 60_000 },
  { label: "6H", ms: 6 * 60 * 60_000 },
  { label: "24H", ms: 24 * 60 * 60_000 },
  { label: "3D", ms: 3 * 24 * 60 * 60_000 },
];

export function TimelineBar() {
  const tl = useStore((s) => s.timeline);
  const toggle = useStore((s) => s.toggleTimeline);
  const setPlaying = useStore((s) => s.setPlaying);
  const setCurrent = useStore((s) => s.setCurrent);
  const setWindow = useStore((s) => s.setWindow);

  // playback loop
  useEffect(() => {
    if (!tl.enabled || !tl.playing) return;
    const step = (tl.max - tl.min) / 240; // ~4s per full sweep at 60fps-ish
    const id = setInterval(() => {
      const next = useStore.getState().timeline.current + step;
      if (next >= tl.max) {
        setCurrent(tl.max);
        setPlaying(false);
      } else setCurrent(next);
    }, 60);
    return () => clearInterval(id);
  }, [tl.enabled, tl.playing, tl.min, tl.max, setCurrent, setPlaying]);

  return (
    <div className="pan-glass absolute bottom-3 left-1/2 z-20 w-[min(720px,calc(100%-2rem))] -translate-x-1/2 px-3 py-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          className={`border px-2 py-1 font-mono text-[10px] font-bold tracking-[0.12em] transition-colors ${
            tl.enabled
              ? "border-[var(--color-intel)] text-[var(--color-intel)]"
              : "border-[var(--color-outline-variant)] text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
          }`}
        >
          TIMELINE {tl.enabled ? "ON" : "OFF"}
        </button>

        {tl.enabled && (
          <>
            <button
              type="button"
              onClick={() => setPlaying(!tl.playing)}
              className="flex h-7 w-7 items-center justify-center border border-[var(--color-outline-variant)] text-[var(--color-intel)] hover:bg-[rgba(0,209,255,0.1)]"
            >
              {tl.playing ? "❚❚" : "▶"}
            </button>
            <input
              type="range"
              min={tl.min}
              max={tl.max}
              value={tl.current}
              step={60_000}
              onChange={(e) => setCurrent(Number(e.target.value))}
              className="flex-1 accent-[var(--color-intel)]"
            />
            <span className="code-data whitespace-nowrap text-[var(--color-on-surface)]">
              {new Date(tl.current).toISOString().slice(0, 16).replace("T", " ")}Z
            </span>
            <div className="flex gap-1">
              {WINDOWS.map((w) => (
                <button
                  key={w.label}
                  type="button"
                  onClick={() => setWindow(w.ms)}
                  className={`border px-1.5 py-0.5 font-mono text-[9px] font-bold transition-colors ${
                    tl.windowMs === w.ms
                      ? "border-[var(--color-gold)] text-[var(--color-gold)]"
                      : "border-[var(--color-outline-variant)] text-[var(--color-outline)]"
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
