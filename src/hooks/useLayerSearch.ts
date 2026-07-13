"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { FeatureCollection } from "geojson";
import { LAYERS_BY_ID } from "@/config/layer-registry";
import { useLayerData } from "@/hooks/useLayerData";
import { liveSearchIndex } from "@/lib/live-search-index";
import { searchEnabledLayers, type LayerSearchHit } from "@/lib/layer-search";
import { useStore } from "@/core/state/store";
import type { LayerData } from "@/hooks/useLayerData";

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

const LIVE_LAYER_IDS = ["satellites", "maritime-ais"] as const;

function layerNameMap(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(LAYERS_BY_ID).map(([id, def]) => [id, def.name]),
  );
}

/** Searchable entity index for enabled Geospatial layers (static, API, and live worker feeds). */
export function useLayerSearch(query: string): LayerSearchHit[] {
  const enabled = useStore((s) => s.enabled);
  const aisShowMilitary = useStore((s) => s.aisShowMilitary);
  const aisShowCargoTanker = useStore((s) => s.aisShowCargoTanker);
  const baseData = useLayerData();

  const liveVersion = useSyncExternalStore(
    liveSearchIndex.subscribe,
    liveSearchIndex.getVersion,
    liveSearchIndex.getVersion,
  );

  const data = useMemo((): Record<string, LayerData> => {
    void liveVersion;
    const out: Record<string, LayerData> = { ...baseData };

    for (const layerId of LIVE_LAYER_IDS) {
      if (!enabled[layerId]) continue;
      const entities = liveSearchIndex.get(layerId);
      if (!entities.length) continue;
      out[layerId] = { entities, raw: EMPTY_FC, health: "live" };
    }

    const ais = out["maritime-ais"];
    if (ais) {
      out["maritime-ais"] = {
        ...ais,
        entities: ais.entities.filter((e) => {
          const cat = e.properties.ais_category;
          if (cat === "military") return aisShowMilitary;
          if (cat === "cargo" || cat === "tanker") return aisShowCargoTanker;
          return false;
        }),
      };
    }

    return out;
  }, [baseData, enabled, liveVersion, aisShowMilitary, aisShowCargoTanker]);

  const names = useMemo(() => layerNameMap(), []);

  return useMemo(
    () => searchEnabledLayers(data, enabled, names, query),
    [data, enabled, names, query],
  );
}
