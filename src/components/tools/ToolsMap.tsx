"use client";

import { useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { MapView } from "@deck.gl/core";
import { PolygonLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { basemapLayer } from "@/components/map/basemap";
import { effectRings, falloutPolygon } from "@/lib/nuclear";
import { greatCirclePath, rangeRing } from "@/lib/ballistics";
import { hexToRgba, type RGBA } from "@/config/theme";

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

export default function ToolsMap(props: Props) {
  const layers = useMemo<Layer[]>(() => {
    const base: Layer[] = [basemapLayer() as unknown as Layer];
    if (props.mode === "detonation" && props.epicenter) {
      base.push(...detonationLayers(props));
    }
    if (props.mode === "missile") {
      base.push(...missileLayers(props));
    }
    return base;
  }, [props]);

  return (
    <DeckGL
      views={new MapView({ id: "tools", repeat: true })}
      initialViewState={{ longitude: 30, latitude: 45, zoom: 3, pitch: 0, bearing: 0 }}
      controller
      layers={layers}
      style={{ position: "absolute", inset: "0", background: "#05070a" }}
      getCursor={() => "crosshair"}
      onClick={(info: PickingInfo) => {
        if (info.coordinate) props.onMapClick([info.coordinate[0], info.coordinate[1]]);
      }}
    />
  );
}

function detonationLayers(p: Props): Layer[] {
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
      data: rings,
      getPolygon: (r: { radiusKm: number }) => rangeRing(center, r.radiusKm),
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
      getPosition: (d: LngLat) => d,
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

function missileLayers(p: Props): Layer[] {
  const out: Layer[] = [];
  if (p.launch) {
    out.push(
      new PolygonLayer({
        id: "missile-range",
        data: [{ polygon: rangeRing(p.launch, p.missileRangeKm) }],
        getPolygon: (d: { polygon: LngLat[] }) => d.polygon,
        getFillColor: [0, 209, 255, 18] as RGBA,
        getLineColor: [0, 209, 255, 200] as RGBA,
        lineWidthMinPixels: 1.5,
        stroked: true,
        filled: true,
      }),
    );
    out.push(
      new ScatterplotLayer({
        id: "launch-pt",
        data: [p.launch],
        getPosition: (d: LngLat) => d,
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
        getPath: (d: { path: LngLat[] }) => d.path,
        getColor: [255, 199, 0, 230] as RGBA,
        getWidth: 2,
        widthUnits: "pixels",
        capRounded: true,
      }),
    );
    out.push(
      new ScatterplotLayer({
        id: "target-pt",
        data: [p.target],
        getPosition: (d: LngLat) => d,
        getRadius: 6,
        radiusUnits: "pixels",
        getFillColor: [255, 75, 43, 255],
      }),
    );
  }
  return out;
}
