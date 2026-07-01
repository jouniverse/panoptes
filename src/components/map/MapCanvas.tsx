"use client";

import { useCallback, useMemo } from "react";
import DeckGL from "@deck.gl/react";
import {
  MapView,
  MapController,
  _GlobeView as GlobeView,
  _GlobeController as GlobeController,
} from "@deck.gl/core";
import type { Layer } from "@deck.gl/core";
import { useStore, type ViewState } from "@/core/state/store";
import { useLayerData } from "@/hooks/useLayerData";
import { useUrlSync } from "@/hooks/useUrlSync";
import { basemapLayer } from "./basemap";
import { useDeckLayers } from "./useDeckLayers";

export default function MapCanvas() {
  useUrlSync();
  const projection = useStore((s) => s.projection);
  const viewState = useStore((s) => s.viewState);
  const setViewState = useStore((s) => s.setViewState);
  const select = useStore((s) => s.select);
  const hover = useStore((s) => s.hover);

  const data = useLayerData();

  const onClusterClick = useCallback(
    (lon: number, lat: number, zoom: number) => {
      setViewState({ ...useStore.getState().viewState, longitude: lon, latitude: lat, zoom });
    },
    [setViewState],
  );

  const dataLayers = useDeckLayers({ data, zoom: viewState.zoom, onClusterClick });

  // Stable basemap instance so panning/zooming never tears down its tile cache.
  const base = useMemo(() => basemapLayer() as unknown as Layer, []);
  const layers: Layer[] = useMemo(() => [base, ...dataLayers], [base, dataLayers]);

  // Distinct view ids per projection: when the id stays the same, deck.gl reuses
  // the existing controller instance, so switching MapView -> GlobeView left a
  // MapController driving a GlobeViewport (MapState.pan/zoom call
  // GlobeViewport.panByPosition with the wrong arity -> "reading '0'" crash).
  // Different ids force the controller to be recreated for the new view.
  const view = useMemo(
    () =>
      projection === "globe"
        ? new GlobeView({ id: "globe" })
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
