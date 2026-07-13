"use client";

import { useEffect, useRef } from "react";
import { LAYERS } from "@/config/layer-registry";
import { isMobileLayout } from "@/hooks/useMobileLayout";
import { useStore, type BasemapStyle, type Projection } from "@/core/state/store";

/**
 * Two-way sync of camera + projection + enabled layers with the URL query
 * string, so views are shareable/deep-linkable (worldmonitor pattern).
 */
export function useUrlSync() {
  const hydrated = useRef(false);

  // hydrate from URL once
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const p = new URLSearchParams(window.location.search);
    const s = useStore.getState();

    const lat = parseFloat(p.get("lat") ?? "");
    const lon = parseFloat(p.get("lon") ?? "");
    const zoom = parseFloat(p.get("z") ?? "");
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      s.setViewState({
        ...s.viewState,
        latitude: lat,
        longitude: lon,
        zoom: Number.isNaN(zoom) ? s.viewState.zoom : zoom,
      });
    }
    const proj = p.get("proj");
    if (proj === "globe" || proj === "flat") {
      const narrow = isMobileLayout();
      s.setProjection(narrow && proj === "globe" ? "flat" : (proj as Projection));
    }

    const basemap = p.get("basemap");
    if (basemap === "strategic" || basemap === "satellite") {
      s.setBasemapStyle(basemap as BasemapStyle);
    }

    const layers = p.get("layers");
    if (layers != null) {
      const on = new Set(layers.split(",").filter(Boolean));
      LAYERS.forEach((l) => s.setLayer(l.id, on.has(l.id)));
    }
  }, []);

  // persist to URL (debounced)
  const view = useStore((s) => s.viewState);
  const projection = useStore((s) => s.projection);
  const basemapStyle = useStore((s) => s.basemapStyle);
  const enabled = useStore((s) => s.enabled);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      p.set("lat", view.latitude.toFixed(4));
      p.set("lon", view.longitude.toFixed(4));
      p.set("z", view.zoom.toFixed(2));
      p.set("proj", projection);
      if (basemapStyle !== "strategic") p.set("basemap", basemapStyle);
      p.set(
        "layers",
        LAYERS.filter((l) => enabled[l.id]).map((l) => l.id).join(","),
      );
      const url = `${window.location.pathname}?${p.toString()}`;
      window.history.replaceState(null, "", url);
    }, 400);
    return () => clearTimeout(t);
  }, [view, projection, basemapStyle, enabled]);
}
