"use client";

import { useCallback, useMemo } from "react";
import DeckGL from "@deck.gl/react";
import {
  MapView,
  MapController,
  _GlobeView as GlobeView,
  _GlobeController as GlobeController,
} from "@deck.gl/core";
import { PolygonLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { basemapLayer } from "@/components/map/basemap";
import { useDeckLayers } from "@/components/map/useDeckLayers";
import { isGlobeProjection } from "@/components/map/globe-layer-props";
import { effectRings, falloutPolygon } from "@/lib/nuclear";
import { greatCirclePath, rangeRingPolygons, rangeRingStrokePaths } from "@/lib/ballistics";
import { hexToRgba, type RGBA } from "@/config/theme";
import { useStore, type ViewState } from "@/core/state/store";
import { useToolsLayerData } from "@/hooks/useToolsLayerData";
import { TOOLS_LAYER_IDS } from "@/config/tools-layers";
import type { GeoEntity } from "@/core/types";
import { lonLatPosition } from "@/lib/entity-position";

export type ToolMode = "detonation" | "missile";
export type LngLat = [number, number];

interface Props {
  mode: ToolMode;
  yieldKt: number;
  burst: "air" | "ground";
  wind: { dirDeg: number; speedKph: number };
  epicenter: LngLat | null;
  launch: LngLat | null;
  target: LngLat | null;
  missileRangeKm: number;
  onMapClick: (lngLat: LngLat) => void;
}

function isGeoEntity(obj: unknown): obj is GeoEntity {
  return (
    typeof obj === "object" &&
    obj != null &&
    "layerId" in obj &&
    "id" in obj &&
    "lon" in obj &&
    "lat" in obj
  );
}

export default function ToolsMap(props: Props) {
  const projection = useStore((s) => s.projection);
  const basemapStyle = useStore((s) => s.basemapStyle);
  const viewState = useStore((s) => s.viewState);
  const setViewState = useStore((s) => s.setViewState);
  const toolsEnabled = useStore((s) => s.toolsEnabled);
  const toolsSelected = useStore((s) => s.toolsSelected);
  const selectToolsEntity = useStore((s) => s.selectToolsEntity);
  const hoverToolsEntity = useStore((s) => s.hoverToolsEntity);

  const layerData = useToolsLayerData();
  const isGlobe = isGlobeProjection(projection);

  const onClusterClick = useCallback(
    (lon: number, lat: number, zoom: number) => {
      setViewState({ ...useStore.getState().viewState, longitude: lon, latitude: lat, zoom });
    },
    [setViewState],
  );

  const dataLayers = useDeckLayers({
    data: layerData,
    zoom: viewState.zoom,
    projection,
    viewCenter: { longitude: viewState.longitude, latitude: viewState.latitude },
    onClusterClick,
    enabledOverride: toolsEnabled,
    layerIds: TOOLS_LAYER_IDS,
    intelFilterOverride: "all",
    selectedIdOverride: toolsSelected?.id,
    onSelect: selectToolsEntity,
    onHover: hoverToolsEntity,
  });

  const toolLayers = useMemo(() => {
    if (props.mode === "detonation" && props.epicenter) {
      return detonationLayers(props, isGlobe);
    }
    if (props.mode === "missile") {
      return missileLayers(props, isGlobe);
    }
    return [];
  }, [props, isGlobe]);

  const base = useMemo(
    () => basemapLayer(basemapStyle, isGlobe) as unknown as Layer,
    [basemapStyle, isGlobe],
  );

  const layers = useMemo(
    () => [base, ...dataLayers, ...toolLayers],
    [base, dataLayers, toolLayers],
  );

  const view = useMemo(
    () =>
      projection === "globe"
        ? new GlobeView({ id: "tools-globe", parameters: { cullMode: "none" } })
        : new MapView({ id: "tools-map", repeat: true }),
    [projection],
  );

  const handleViewState = useCallback(
    (v: Partial<ViewState>) => {
      setViewState({
        longitude: v.longitude ?? viewState.longitude,
        latitude: v.latitude ?? viewState.latitude,
        zoom: v.zoom ?? viewState.zoom,
        pitch: v.pitch ?? 0,
        bearing: v.bearing ?? 0,
      });
    },
    [setViewState, viewState],
  );

  const handleClick = useCallback(
    (info: PickingInfo) => {
      if (isGeoEntity(info.object)) {
        selectToolsEntity(info.object);
        return;
      }
      if (info.coordinate) {
        selectToolsEntity(null);
        props.onMapClick([info.coordinate[0], info.coordinate[1]]);
      }
    },
    [props.onMapClick, selectToolsEntity],
  );

  return (
    <DeckGL
      views={view}
      viewState={viewState}
      onViewStateChange={(e) => handleViewState(e.viewState as Partial<ViewState>)}
      controller={{
        type: projection === "globe" ? GlobeController : MapController,
        doubleClickZoom: true,
        inertia: 250,
      }}
      layers={layers}
      style={{ position: "absolute", inset: "0", background: "#05070a" }}
      getCursor={() => "crosshair"}
      onClick={handleClick}
      onHover={(info) => {
        if (!info.object) hoverToolsEntity(null, null);
      }}
    />
  );
}

function surfacePos(d: LngLat, isGlobe: boolean): LngLat | [number, number, number] {
  return lonLatPosition(d[0], d[1], isGlobe);
}

function detonationLayers(p: Props, isGlobe: boolean): Layer[] {
  const center = p.epicenter!;
  const rings = effectRings(p.yieldKt);
  const out: Layer[] = [];

  if (p.burst === "ground") {
    const doses: (1 | 10 | 100)[] = [1, 10, 100];
    out.push(
      new PolygonLayer({
        id: "fallout",
        data: doses.map((d) => ({
          dose: d,
          polygon: falloutPolygon(center[0], center[1], p.yieldKt, p.wind.dirDeg, p.wind.speedKph, d),
        })),
        pickable: false,
        getPolygon: (d: { polygon: LngLat[] }) => d.polygon,
        getFillColor: (d: { dose: number }) =>
          [0, 255, 65, d.dose >= 100 ? 70 : d.dose >= 10 ? 45 : 25] as RGBA,
        getLineColor: [0, 255, 65, 160] as RGBA,
        lineWidthMinPixels: 1,
        stroked: true,
        filled: true,
      }),
    );
  }

  out.push(
    new PolygonLayer({
      id: "blast-rings",
      data: rings.flatMap((r) =>
        rangeRingPolygons(center, r.radiusKm).map((polygon, i) => ({
          ...r,
          polygon,
          seg: i,
        })),
      ),
      pickable: false,
      getPolygon: (d: { polygon: LngLat[][] }) => d.polygon,
      getFillColor: (r: { color: string }) => {
        const c = hexToRgba(r.color);
        return [c[0], c[1], c[2], 30] as RGBA;
      },
      getLineColor: (r: { color: string }) => hexToRgba(r.color),
      lineWidthMinPixels: 1.5,
      stroked: true,
      filled: true,
    }),
  );
  out.push(
    new ScatterplotLayer({
      id: "ground-zero",
      data: [center],
      pickable: false,
      getPosition: (d: LngLat) => surfacePos(d, isGlobe),
      getRadius: 5,
      radiusUnits: "pixels",
      getFillColor: [255, 255, 255, 255],
      getLineColor: [255, 75, 43, 255],
      lineWidthMinPixels: 2,
      stroked: true,
    }),
  );
  return out;
}

function missileLayers(p: Props, isGlobe: boolean): Layer[] {
  const out: Layer[] = [];
  if (p.launch) {
    const fillPolys = rangeRingPolygons(p.launch, p.missileRangeKm);
    const strokePaths = rangeRingStrokePaths(p.launch, p.missileRangeKm);

    out.push(
      new PolygonLayer({
        id: "missile-range-fill",
        data: fillPolys.map((polygon, i) => ({ polygon, i })),
        pickable: false,
        getPolygon: (d: { polygon: LngLat[][] }) => d.polygon,
        getFillColor: [0, 209, 255, 18] as RGBA,
        getLineColor: [0, 209, 255, 0] as RGBA,
        stroked: false,
        filled: true,
        parameters: { depthCompare: "always" },
      }),
    );
    out.push(
      new PathLayer({
        id: "missile-range-stroke",
        data: strokePaths.map((path, i) => ({ path, i })),
        pickable: false,
        getPath: (d: { path: LngLat[] }) => d.path,
        getColor: [0, 209, 255, 200] as RGBA,
        getWidth: 1.5,
        widthUnits: "pixels",
        capRounded: true,
        jointRounded: true,
        parameters: { depthCompare: "always" },
      }),
    );
    out.push(
      new ScatterplotLayer({
        id: "launch-pt",
        data: [p.launch],
        pickable: false,
        getPosition: (d: LngLat) => surfacePos(d, isGlobe),
        getRadius: 6,
        radiusUnits: "pixels",
        getFillColor: [0, 255, 65, 255],
      }),
    );
  }
  if (p.launch && p.target) {
    out.push(
      new PathLayer({
        id: "trajectory",
        data: [{ path: greatCirclePath(p.launch, p.target) }],
        pickable: false,
        getPath: (d: { path: LngLat[] }) => d.path,
        getColor: [255, 199, 0, 230] as RGBA,
        getWidth: 2,
        widthUnits: "pixels",
        capRounded: true,
        parameters: { depthCompare: "always" },
      }),
    );
    out.push(
      new ScatterplotLayer({
        id: "target-pt",
        data: [p.target],
        pickable: false,
        getPosition: (d: LngLat) => surfacePos(d, isGlobe),
        getRadius: 6,
        radiusUnits: "pixels",
        getFillColor: [255, 75, 43, 255],
      }),
    );
  }
  return out;
}
