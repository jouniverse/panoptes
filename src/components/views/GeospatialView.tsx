"use client";

import dynamic from "next/dynamic";
import { LeftRail } from "@/components/shell/LeftRail";
import { RightPanel } from "@/components/shell/RightPanel";
import { MapControls } from "@/components/map/MapControls";
import { HoverTooltip } from "@/components/map/HoverTooltip";
import { TimelineBar } from "@/components/map/TimelineBar";

// deck.gl + canvas APIs are browser-only.
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="pan-grid flex flex-1 items-center justify-center">
      <span className="label-caps pan-pulse text-[var(--color-intel)]">
        GEOSPATIAL CORE // ENGAGING MAP ENGINE
      </span>
    </div>
  ),
});

export function GeospatialView() {
  return (
    <>
      <LeftRail />
      <div className="pan-crosshair pan-frame relative flex min-w-0 flex-1">
        <MapCanvas />
        <MapControls />
        <HoverTooltip />
        <TimelineBar />
      </div>
      <RightPanel />
    </>
  );
}
