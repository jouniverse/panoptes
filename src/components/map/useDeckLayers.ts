"use client";

import { useMemo } from "react";
import { IconLayer, ScatterplotLayer, TextLayer, GeoJsonLayer } from "@deck.gl/layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { LAYERS, layerInIntelMode } from "@/config/layer-registry";
import { useStore } from "@/core/state/store";
import { hexToRgba, RGB, type RGBA } from "@/config/theme";
import type { GeoEntity, LayerDefinition } from "@/core/types";
import type { LayerData } from "@/hooks/useLayerData";
import { getMarkerAtlas } from "./markers";
import { clusterPoints, clusterExpansionZoom, getClusterLeafIndices, CLUSTER_THRESHOLD } from "./clustering";
import { pmtilesLayer } from "./pmtiles";
import { markerColorFor, toneToColor } from "@/config/marker-style";
import type { Projection } from "@/core/state/store";
import { entityPosition, globeLabelPosition, lonLatPosition } from "@/lib/entity-position";
import { isGlobePointVisible } from "@/lib/globe-visibility";
import { globeIconLayerProps, globeTextLayerProps, isGlobeProjection } from "./globe-layer-props";

interface BuildArgs {
  data: Record<string, LayerData>;
  zoom: number;
  projection: Projection;
  viewCenter: { longitude: number; latitude: number };
  onClusterClick: (lon: number, lat: number, zoom: number) => void;
}

export function useDeckLayers({
  data,
  zoom,
  projection,
  viewCenter,
  onClusterClick,
}: BuildArgs): Layer[] {
  const enabled = useStore((s) => s.enabled);
  const intelFilter = useStore((s) => s.intelFilter);
  const selectedId = useStore((s) => s.selected?.id);
  const select = useStore((s) => s.select);
  const hover = useStore((s) => s.hover);
  const timeline = useStore((s) => s.timeline);
  const eqWindowDays = useStore((s) => s.eqWindowDays);

  const tlEnabled = timeline.enabled;
  const tlLo = timeline.current - timeline.windowMs;
  const tlHi = timeline.current;
  // Quantize zoom so clustering/layer rebuilds happen on meaningful steps, not
  // on every sub-pixel wheel delta (perf).
  const zoomBucket = Math.round(zoom * 2) / 2;
  const isGlobe = isGlobeProjection(projection);

  return useMemo(() => {
    const atlas = typeof document !== "undefined" ? getMarkerAtlas() : null;
    const layers: Layer[] = [];

    for (const def of LAYERS) {
      if (!enabled[def.id]) continue;
      if (intelFilter !== "all" && !layerInIntelMode(def, intelFilter)) continue;
      if (def.minZoom != null && zoom < def.minZoom) continue;

      // Tier B: vector tiles streamed directly from a PMTiles archive.
      if (def.source.kind === "pmtiles") {
        layers.push(pmtilesLayer(def));
        continue;
      }

      const ld = data[def.id];
      if (!ld) continue;

      if (def.kind === "line" || def.kind === "polygon") {
        layers.push(buildVectorLayer(def, ld, select));
        continue;
      }
      // point-based layers (point/heatmap rendered as markers + optional cluster)
      if (atlas) {
        // Timeline filter: only constrains entities that carry a timestamp;
        // static/reference layers (no timestamp) always remain visible.
        let entities = ld.entities;
        // Earthquakes: client-side 1d/7d window over the 7-day USGS feed.
        if (def.id === "earthquakes" && eqWindowDays < 7) {
          const cutoff = Date.now() - eqWindowDays * 24 * 60 * 60_000;
          entities = entities.filter((e) => e.timestamp == null || e.timestamp >= cutoff);
        }
        if (tlEnabled) {
          const hasTime = entities.some((e) => e.timestamp != null);
          if (hasTime) {
            entities = entities.filter(
              (e) => e.timestamp == null || (e.timestamp >= tlLo && e.timestamp <= tlHi),
            );
          }
        }
        layers.push(
          ...buildPointLayers(
            def,
            entities,
            zoom,
            atlas,
            selectedId,
            select,
            hover,
            onClusterClick,
            isGlobe,
            viewCenter,
          ),
        );
      }
    }
    return layers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data,
    enabled,
    intelFilter,
    zoomBucket,
    selectedId,
    tlEnabled,
    tlLo,
    tlHi,
    eqWindowDays,
    isGlobe,
    viewCenter.longitude,
    viewCenter.latitude,
  ]);
}

function buildVectorLayer(
  def: LayerDefinition,
  ld: LayerData,
  select: (e: GeoEntity | null) => void,
): Layer {
  const color = hexToRgba(def.color);
  const fill: RGBA = [color[0], color[1], color[2], def.kind === "polygon" ? 28 : 0];
  return new GeoJsonLayer({
    id: `layer-${def.id}`,
    data: ld.raw,
    pickable: true,
    stroked: true,
    filled: def.kind === "polygon",
    getLineColor: color,
    getFillColor: fill,
    lineWidthMinPixels: def.kind === "line" ? 1.2 : 1,
    lineWidthMaxPixels: 4,
    getLineWidth: 2,
    lineWidthUnits: "pixels",
    onClick: (info: PickingInfo) => {
      const e = ld.entities[info.index];
      if (e) select(e);
    },
  });
}

function buildPointLayers(
  def: LayerDefinition,
  entities: GeoEntity[],
  zoom: number,
  atlas: { atlas: HTMLCanvasElement; mapping: Record<string, unknown> },
  selectedId: string | undefined,
  select: (e: GeoEntity | null) => void,
  hover: (e: GeoEntity | null, screen?: { x: number; y: number } | null) => void,
  onClusterClick: (lon: number, lat: number, zoom: number) => void,
  isGlobe: boolean,
  viewCenter: { longitude: number; latitude: number },
): Layer[] {
  const color = hexToRgba(def.color);
  // Satellites at orbital altitude: surface cluster bubbles misalign with icons on globe.
  const shouldCluster =
    entities.length > CLUSTER_THRESHOLD && !(isGlobe && def.id === "satellites");
  const out: Layer[] = [];

  if (!shouldCluster) {
    out.push(
      markerLayer(def, entities, color, atlas, selectedId, select, hover, isGlobe, viewCenter),
    );
    return out;
  }

  const points = clusterPoints(def.id, entities, zoom);
  const clusters = points.filter((p) => p.isCluster);
  const leaves = points.filter((p) => !p.isCluster).map((p) => p.entity!) as GeoEntity[];

  // Precompute per-cluster average tone for tone-colored layers (GDELT).
  // Done once per zoom/data change, not in the getFillColor accessor.
  const clusterToneMap = new Map<number, RGBA>();
  if (def.id === "conflict-events") {
    for (const c of clusters) {
      if (c.clusterId == null) continue;
      const indices = getClusterLeafIndices(def.id, c.clusterId);
      const tones = indices
        .map((i) => entities[i]?.properties?.tone)
        .filter((t): t is number => typeof t === "number");
      if (tones.length) {
        const avg = tones.reduce((a, b) => a + b, 0) / tones.length;
        clusterToneMap.set(c.clusterId, toneToColor(avg));
      }
    }
  }

  // cluster bubbles
  out.push(
    new ScatterplotLayer({
      id: `cluster-${def.id}`,
      data: clusters,
      pickable: true,
      stroked: true,
      filled: true,
      radiusUnits: "pixels",
      getPosition: (d: { lon: number; lat: number }) => lonLatPosition(d.lon, d.lat, isGlobe),
      getRadius: (d: { count?: number }) => 10 + Math.min(18, Math.log2((d.count ?? 2) + 1) * 3),
      getFillColor: (d: { clusterId?: number }) => {
        const tc = d.clusterId != null ? clusterToneMap.get(d.clusterId) : undefined;
        return tc ? ([tc[0], tc[1], tc[2], 50] as RGBA) : ([color[0], color[1], color[2], 38] as RGBA);
      },
      getLineColor: (d: { clusterId?: number }) => {
        const tc = d.clusterId != null ? clusterToneMap.get(d.clusterId) : undefined;
        return tc ?? color;
      },
      lineWidthMinPixels: 1.5,
      onClick: (info: PickingInfo) => {
        const c = info.object as { lon: number; lat: number; clusterId?: number };
        if (c?.clusterId != null) {
          onClusterClick(c.lon, c.lat, clusterExpansionZoom(def.id, c.clusterId));
        }
      },
      updateTriggers: {
        getFillColor: [def.id, clusters.length],
        getLineColor: [def.id, clusters.length],
      },
    }),
  );
  out.push(
    new TextLayer({
      id: `cluster-count-${def.id}`,
      data: clusters,
      pickable: false,
      getPosition: (d: { lon: number; lat: number }) => globeLabelPosition(d.lon, d.lat, isGlobe),
      getText: (d: { count?: number }) => String(d.count ?? ""),
      getSize: 11,
      fontFamily: "JetBrains Mono, monospace",
      getColor: isGlobe ? [235, 240, 245, 255] : RGB.onSurface,
      outlineWidth: isGlobe ? 2 : 0,
      outlineColor: [0, 0, 0, 255],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      ...globeTextLayerProps(isGlobe),
    }),
  );
  out.push(
    markerLayer(def, leaves, color, atlas, selectedId, select, hover, isGlobe, viewCenter),
  );
  return out;
}

function markerLayer(
  def: LayerDefinition,
  entities: GeoEntity[],
  color: RGBA,
  atlas: { atlas: HTMLCanvasElement; mapping: Record<string, unknown> },
  selectedId: string | undefined,
  select: (e: GeoEntity | null) => void,
  hover: (e: GeoEntity | null, screen?: { x: number; y: number } | null) => void,
  isGlobe: boolean,
  viewCenter: { longitude: number; latitude: number },
): Layer {
  const visibleEntities =
    isGlobe && entities.length
      ? entities.filter((e) =>
          isGlobePointVisible(e.lon, e.lat, viewCenter.longitude, viewCenter.latitude),
        )
      : entities;

  // Optional per-entity colour (age, active/inactive, …); falls back to the
  // layer's flat colour when no resolver is registered for this layer.
  const colorFn = markerColorFor(def.id);
  return new IconLayer<GeoEntity>({
    id: `layer-${def.id}`,
    data: visibleEntities,
    pickable: true,
    iconAtlas: atlas.atlas as unknown as string,
    iconMapping: atlas.mapping as never,
    getIcon: () => def.marker,
    getPosition: (d) => entityPosition(d, isGlobe),
    getSize: (d) =>
      (d.id === selectedId ? 26 : 18) *
      (1 + (d.severity ?? 0) * 0.6) *
      (def.sizeScale ?? 1),
    sizeUnits: "pixels",
    getColor: (d) => {
      const base = colorFn ? colorFn(d) : ([color[0], color[1], color[2], 235] as RGBA);
      if (d.id === selectedId) {
        // For tone/age-colored layers keep the entity color (size is the selection
        // cue). For flat-color layers flash gold so selection is unmissable.
        return colorFn ? ([base[0], base[1], base[2], 255] as RGBA) : RGB.gold;
      }
      return base;
    },
    getAngle: (d) =>
      def.marker === "chevron" && typeof d.properties.heading === "number"
        ? -(d.properties.heading as number)
        : 0,
    onClick: (info: PickingInfo) => {
      if (info.object) select(info.object as GeoEntity);
    },
    onHover: (info: PickingInfo) => {
      hover(
        (info.object as GeoEntity) ?? null,
        info.object ? { x: info.x, y: info.y } : null,
      );
    },
    ...globeIconLayerProps(isGlobe),
    updateTriggers: {
      getSize: [selectedId],
      getColor: [selectedId],
      getPosition: [isGlobe],
      data: [viewCenter.longitude, viewCenter.latitude, isGlobe],
    },
  });
}
