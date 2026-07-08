"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Panel } from "@/components/ui/primitives";
import { useOpsStore } from "@/core/state/ops-store";

const ESRI =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export function OpsMapPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const location = useOpsStore((s) => s.location);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          esri: { type: "raster", tiles: [ESRI], tileSize: 256 },
        },
        layers: [{ id: "esri", type: "raster", source: "esri" }],
      },
      center: [17.86, 34.06],
      zoom: 1.6,
      attributionControl: false,
    });
    mapRef.current = map;
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !location) return;
    const fly = () => {
      map.flyTo({
        center: [location.lon, location.lat],
        zoom: location.zoom ?? 7,
        duration: 1200,
      });
      if (!markerRef.current) {
        const el = document.createElement("div");
        el.className = "ops-map-marker";
        markerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([location.lon, location.lat])
          .addTo(map);
      } else {
        markerRef.current.setLngLat([location.lon, location.lat]);
      }
    };
    if (map.loaded()) fly();
    else map.once("load", fly);
  }, [location]);

  return (
    <Panel title="SITUATIONAL AWARENESS // MAP" className="lg:col-span-1">
      <div ref={containerRef} className="h-[280px] w-full bg-[#05070a]" />
      {!location && (
        <div className="label-caps border-t border-[var(--color-outline-variant)] px-3 py-2 text-[var(--color-outline)]">
          Click a geo-located feed item to center the map
        </div>
      )}
    </Panel>
  );
}
