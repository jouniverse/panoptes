"use client";

import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { FeatureCollection } from "geojson";
import { LAYERS, LAYERS_BY_ID } from "@/config/layer-registry";
import { fieldMapFor } from "@/config/field-maps";
import { geojsonToEntities } from "@/lib/geo";
import { useStore } from "@/core/state/store";
import type { FeedHealth, GeoEntity, LayerDefinition } from "@/core/types";

export interface LayerData {
  entities: GeoEntity[];
  raw: FeatureCollection;
  health: FeedHealth;
}

async function fetchLayer(layer: LayerDefinition): Promise<LayerData> {
  const url =
    layer.source.kind === "static"
      ? `/geo/${layer.source.ref}`
      : `/api/${layer.source.ref}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${layer.id}: HTTP ${res.status}`);
  const fc = (await res.json()) as FeatureCollection;
  if (!fc || fc.type !== "FeatureCollection") {
    throw new Error(`${layer.id}: not a FeatureCollection`);
  }
  const header = res.headers.get("X-Panoptes-Health") as FeedHealth | null;
  const health: FeedHealth = header ?? "live";
  return {
    entities: geojsonToEntities(fc, layer.id, fieldMapFor(layer.id)),
    raw: fc,
    health,
  };
}

/** Loads data for every enabled, fetchable (static|api) layer and reports
 *  counts + feed health into the store. PMTiles layers are handled by the
 *  MVT renderer and skipped here. */
export function useLayerData(opts?: {
  enabled?: Record<string, boolean>;
  layerIds?: readonly string[];
  reportToStore?: boolean;
}): Record<string, LayerData> {
  const storeEnabled = useStore((s) => s.enabled);
  const setHealth = useStore((s) => s.setHealth);
  const setCount = useStore((s) => s.setCount);

  const enabled = opts?.enabled ?? storeEnabled;
  const reportToStore = opts?.reportToStore ?? true;
  const layerIdsKey = opts?.layerIds?.join(",") ?? "";
  const idSet = useMemo(
    () => (opts?.layerIds ? new Set(opts.layerIds) : null),
    [layerIdsKey],
  );

  const active = useMemo(
    () =>
      LAYERS.filter(
        (l) =>
          enabled[l.id] &&
          (!idSet || idSet.has(l.id)) &&
          !l.placeholder &&
          l.source.kind !== "pmtiles" &&
          l.source.kind !== "worker",
      ),
    [enabled, idSet],
  );

  const results = useQueries({
    queries: active.map((layer) => ({
      queryKey: reportToStore ? ["layer", layer.id] : ["tools-layer", layer.id],
      queryFn: () => fetchLayer(layer),
      refetchInterval: cadenceMs(layer.source.cadence),
      staleTime: cadenceMs(layer.source.cadence) ?? Infinity,
    })),
  });

  // Report health + counts as a side effect (not during render).
  useEffect(() => {
    if (!reportToStore) return;
    active.forEach((layer, i) => {
      const r = results[i];
      if (r.isSuccess) {
        setHealth(layer.id, r.data.health);
        setCount(layer.id, r.data.entities.length);
      } else if (r.isError) {
        setHealth(layer.id, layer.source.kind === "api" ? "stale" : "offline");
      } else if (r.isLoading) {
        setHealth(layer.id, "idle");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.status).join(","), active.length]);

  return useMemo(() => {
    const out: Record<string, LayerData> = {};
    active.forEach((layer, i) => {
      const r = results[i];
      if (r.isSuccess) out[layer.id] = r.data;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.dataUpdatedAt).join(","), active.length]);
}

function cadenceMs(cadence: string): number | undefined {
  switch (cadence) {
    case "60s":
      return 60_000;
    case "15min":
      return 15 * 60_000;
    case "30min":
      return 30 * 60_000;
    case "hourly":
      return 60 * 60_000;
    case "daily":
      return 24 * 60 * 60_000;
    default:
      return undefined; // static / annual / 7d-30d: load once
  }
}

export { LAYERS_BY_ID };
