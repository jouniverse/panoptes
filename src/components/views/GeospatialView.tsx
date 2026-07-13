"use client";

import dynamic from "next/dynamic";
import { LeftRail } from "@/components/shell/LeftRail";
import { RightPanel } from "@/components/shell/RightPanel";
import { MapControls } from "@/components/map/MapControls";
import { MapLegend } from "@/components/map/MapLegend";
import { HoverTooltip } from "@/components/map/HoverTooltip";
import { useStore } from "@/core/state/store";

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
  const basemapStyle = useStore((s) => s.basemapStyle);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 self-stretch">
      <LeftRail />
      <div className="pan-crosshair pan-frame relative flex min-w-0 flex-1">
        <MapCanvas />
        <MapControls />
        <MapLegend />
        <HoverTooltip />
        {basemapStyle === "satellite" && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 label-caps text-[9px] text-[var(--color-outline)]">
            Esri World Imagery
          </div>
        )}
      </div>
      <RightPanel />
    </div>
  );
}
