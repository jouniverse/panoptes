"use client";

import { useCallback, useEffect, useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { PathLayer } from "@deck.gl/layers";
import {
  MapView,
  MapController,
  _GlobeView as GlobeView,
  _GlobeController as GlobeController,
} from "@deck.gl/core";
import type { Layer } from "@deck.gl/core";
import type { FeatureCollection } from "geojson";
import { useStore, type ViewState } from "@/core/state/store";
import { useLayerData } from "@/hooks/useLayerData";
import { useUrlSync } from "@/hooks/useUrlSync";
import { useSatellites } from "@/hooks/useSatellites";
import { useVessels } from "@/hooks/useVessels";
import { basemapLayer } from "./basemap";
import { useDeckLayers } from "./useDeckLayers";
import type { GeoEntity, FeedHealth } from "@/core/types";
import type { LayerData } from "@/hooks/useLayerData";
import { computeOrbitGroundTrack, orbitTrackPathsForProjection } from "@/lib/satellite-track";
import { RGB } from "@/config/theme";
import satMeta from "@/data/military-satellites-meta.json";

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Rough map viewport bbox from deck view state (for AIS culling). */
function viewportBbox(vs: ViewState) {
  const latSpan = 180 / 2 ** vs.zoom;
  const lonSpan = 360 / 2 ** vs.zoom;
  return {
    west: vs.longitude - lonSpan / 2,
    east: vs.longitude + lonSpan / 2,
    south: Math.max(-85, vs.latitude - latSpan / 2),
    north: Math.min(85, vs.latitude + latSpan / 2),
  };
}

/** UCS attributes per NORAD id (country/operator/users/purpose/detail/orbit). */
const SAT_META = satMeta as Record<
  string,
  { country?: string; operator?: string; users?: string; purpose?: string; detail?: string; orbit?: string }
>;

export default function MapCanvas() {
  useUrlSync();
  const projection = useStore((s) => s.projection);
  const basemapStyle = useStore((s) => s.basemapStyle);
  const viewState = useStore((s) => s.viewState);
  const setViewState = useStore((s) => s.setViewState);
  const select = useStore((s) => s.select);
  const hover = useStore((s) => s.hover);
  const selected = useStore((s) => s.selected);
  const enabled = useStore((s) => s.enabled);
  const setHealth = useStore((s) => s.setHealth);
  const setCount = useStore((s) => s.setCount);

  // Satellite layer: live TLE propagation in a Web Worker.
  // Only activated when the layer is toggled on (saves resources).
  const satEnabled = !!enabled["satellites"];
  const { positions: satPositions, health: satHealthRaw, tles: satTles } = useSatellites(
    "gov-military",
    satEnabled,
  );

  const aisEnabled = !!enabled["maritime-ais"];
  const aisViewport = useMemo(() => viewportBbox(viewState), [viewState]);
  const { vessels: aisVessels, health: aisHealthRaw } = useVessels({
    enabled: aisEnabled,
    viewport: aisViewport,
  });

  const baseData = useLayerData();

  // Merge satellite positions into the standard LayerData map so useDeckLayers
  // can render them through the normal point-layer pipeline.
  const data = useMemo((): Record<string, LayerData> => {
    let merged = baseData;

    if (satEnabled && satPositions.length > 0) {
      const satEntities: GeoEntity[] = satPositions.map((p) => {
        const meta = p.norad != null ? SAT_META[String(p.norad)] : undefined;
        return {
          id: `sat-${p.name.replace(/\s+/g, "_")}`,
          layerId: "satellites",
          lon: p.lon,
          lat: p.lat,
          label: p.name,
          properties: {
            name: p.name,
            altitude_km: Math.round(p.alt),
            norad: p.norad,
            country: meta?.country,
            operator: meta?.operator,
            users: meta?.users,
            purpose: meta?.purpose,
            detail: meta?.detail,
            orbit: meta?.orbit,
          },
        };
      });
      merged = {
        ...merged,
        satellites: {
          entities: satEntities,
          raw: EMPTY_FC,
          health: satHealthRaw as FeedHealth,
        },
      };
    }

    if (aisEnabled && aisVessels.length > 0) {
      merged = {
        ...merged,
        "maritime-ais": {
          entities: aisVessels,
          raw: EMPTY_FC,
          health: aisHealthRaw,
        },
      };
    }

    return merged;
  }, [baseData, satEnabled, satPositions, satHealthRaw, aisEnabled, aisVessels, aisHealthRaw]);

  // Report satellite health + count into the store (mirrors what useLayerData
  // does for GeoJSON layers). Must run in useEffect — setState during render
  // triggers "Cannot update BottomBar while rendering MapCanvas".
  useEffect(() => {
    if (!satEnabled) return;
    setHealth("satellites", satHealthRaw as FeedHealth);
    setCount("satellites", satPositions.length);
  }, [satEnabled, satHealthRaw, satPositions.length, setHealth, setCount]);

  useEffect(() => {
    if (!aisEnabled) return;
    setHealth("maritime-ais", aisHealthRaw);
    setCount("maritime-ais", aisVessels.length);
  }, [aisEnabled, aisHealthRaw, aisVessels.length, setHealth, setCount]);

  const onClusterClick = useCallback(
    (lon: number, lat: number, zoom: number) => {
      setViewState({ ...useStore.getState().viewState, longitude: lon, latitude: lat, zoom });
    },
    [setViewState],
  );

  const dataLayers = useDeckLayers({
    data,
    zoom: viewState.zoom,
    projection,
    viewCenter: { longitude: viewState.longitude, latitude: viewState.latitude },
    onClusterClick,
  });

  const satelliteTrackLayers = useMemo((): Layer[] => {
    if (!satEnabled || selected?.layerId !== "satellites") return [];
    const norad = selected.properties.norad as number | undefined;
    if (norad == null) return [];
    const tle = satTles.find((t) => t.norad === norad);
    if (!tle) return [];

    const track = computeOrbitGroundTrack(tle.line1, tle.line2);
    if (!track) return [];

    const isGlobe = projection === "globe";

    const makePathLayer = (
      id: string,
      segments: [number, number][][] | [number, number, number][][],
      alpha: number,
      width: number,
    ): Layer | null => {
      const data = segments.filter((path) => path.length >= 2).map((path, i) => ({ path, i }));
      if (!data.length) return null;
      return new PathLayer({
        id,
        data,
        pickable: false,
        widthUnits: "pixels",
        getPath: (d: { path: [number, number][] | [number, number, number][] }) => d.path,
        getColor: [RGB.friendly[0], RGB.friendly[1], RGB.friendly[2], alpha],
        getWidth: width,
        capRounded: true,
        jointRounded: true,
        parameters: { depthCompare: "always" },
        updateTriggers: {
          getPath: [norad, satPositions.length, isGlobe],
        },
      });
    };

    return [
      makePathLayer(
        "satellite-ground-track-past",
        orbitTrackPathsForProjection(track.past, isGlobe),
        75,
        1.5,
      ),
      makePathLayer(
        "satellite-ground-track-future",
        orbitTrackPathsForProjection(track.future, isGlobe),
        170,
        2,
      ),
    ].filter((l): l is Layer => l != null);
  }, [satEnabled, selected, satTles, satPositions.length, projection]);

  // Rebuild when basemap style changes so tile URL / tint update.
  const base = useMemo(
    () => basemapLayer(basemapStyle, projection === "globe") as unknown as Layer,
    [basemapStyle, projection],
  );
  const layers: Layer[] = useMemo(
    () => [base, ...dataLayers, ...satelliteTrackLayers],
    [base, dataLayers, satelliteTrackLayers],
  );

  // Distinct view ids per projection: when the id stays the same, deck.gl reuses
  // the existing controller instance, so switching MapView -> GlobeView left a
  // MapController driving a GlobeViewport (MapState.pan/zoom call
  // GlobeViewport.panByPosition with the wrong arity -> "reading '0'" crash).
  // Different ids force the controller to be recreated for the new view.
  const view = useMemo(
    () =>
      projection === "globe"
        ? new GlobeView({
            id: "globe",
            // GlobeView defaults to cullMode:back, which culls billboard IconLayer quads
            // on the near hemisphere (deck.gl#9777). TextLayer/Scatterplot are unaffected.
            parameters: { cullMode: "none" },
          })
        : new MapView({ id: "map", repeat: true }),
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

  return (
    <DeckGL
      views={view}
      viewState={viewState}
      onViewStateChange={(e) => handleViewState(e.viewState as Partial<ViewState>)}
      controller={{
        // Pin the controller class to the active projection so a GlobeViewport is
        // never driven by a MapController (and vice versa).
        type: projection === "globe" ? GlobeController : MapController,
        doubleClickZoom: true,
        inertia: 250,
      }}
      layers={layers}
      // Always the tactical crosshair — never the browser pointer (hover) or
      // grab/grabbing hand (drag). Notes lines 15 / 1285.
      getCursor={() => "crosshair"}
      onClick={(info) => {
        if (!info.object) select(null);
      }}
      style={{ position: "absolute", inset: "0", background: "#05070a" }}
      onHover={(info) => {
        if (!info.object) hover(null, null);
      }}
    />
  );
}
