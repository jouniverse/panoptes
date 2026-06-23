"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/core/state/store";

const TICKER_SEED = [
  "INTEL FEED LIVE",
  "AGGREGATING PUBLIC SOURCES",
  "GDELT // UCDP // RELIEFWEB // USGS // ADSB.LOL",
  "NO CLASSIFIED DATA // OSINT ONLY",
];

export function BottomBar() {
  const view = useStore((s) => s.viewState);
  const health = useStore((s) => s.health);
  const counts = useStore((s) => s.counts);

  const [clock, setClock] = useState("--:--:--");
  useEffect(() => {
    const t = setInterval(
      () => setClock(new Date().toISOString().slice(11, 19) + "Z"),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  const liveFeeds = Object.values(health).filter((h) => h === "live").length;
  const totalEntities = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--color-alert)] bg-[var(--color-surface)] px-3">
      <div className="flex items-center gap-2 overflow-hidden">
        <span className="status-dot pan-pulse" style={{ background: "var(--color-alert)" }} />
        <div className="hidden w-[420px] overflow-hidden md:block">
          <div className="pan-ticker label-caps text-[var(--color-on-surface-variant)]">
            {[...TICKER_SEED, ...TICKER_SEED].join("   //   ")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 label-caps text-[var(--color-on-surface-variant)]">
        <span>
          LAT {view.latitude.toFixed(3)} {"//"} LON {view.longitude.toFixed(3)}{" "}
          {"//"} Z {view.zoom.toFixed(1)}
        </span>
        <span className="hidden sm:inline">
          FEEDS{" "}
          <span className="text-[var(--color-friendly)]">{liveFeeds} LIVE</span>
        </span>
        <span className="hidden sm:inline text-[var(--color-intel)]">
          {totalEntities.toLocaleString()} ENT
        </span>
        <span className="text-[var(--color-friendly)]">{clock}</span>
        <span className="hidden lg:inline">ENC: AES-256-GCM</span>
      </div>
    </footer>
  );
}
