"use client";

import { useLayerData } from "@/hooks/useLayerData";
import { TOOLS_LAYER_IDS } from "@/config/tools-layers";
import { useStore } from "@/core/state/store";

/** Loads GeoJSON for Tools-view layer toggles only (does not affect Geospatial health badges). */
export function useToolsLayerData() {
  const toolsEnabled = useStore((s) => s.toolsEnabled);
  return useLayerData({
    enabled: toolsEnabled,
    layerIds: TOOLS_LAYER_IDS,
    reportToStore: false,
  });
}
