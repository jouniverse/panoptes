"use client";

import { useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { MapView } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection } from "geojson";
import { INDICATOR_META, type CountryIndicators, type IndicatorKey } from "@/config/indicators";
import type { RGBA } from "@/config/theme";

function ramp(t: number): RGBA {
  // intel-blue (low) -> gold (mid) -> alert-red (high)
  const c = Math.max(0, Math.min(1, t));
  if (c < 0.5) {
    const k = c / 0.5;
    return [Math.round(0 + k * 255), Math.round(209 - k * 10), Math.round(255 - k * 255), 200];
  }
  const k = (c - 0.5) / 0.5;
  return [255, Math.round(199 - k * 124), Math.round(0 + k * 43), 200];
}

export function ChoroplethMap({
  indicator,
  indicators,
  selectedIso,
  onSelect,
}: {
  indicator: IndicatorKey;
  indicators: Record<string, CountryIndicators>;
  selectedIso: string | null;
  onSelect: (iso: string, name: string) => void;
}) {
  const [borders, setBorders] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch("/geo/country-borders.geojson")
      .then((r) => r.json())
      .then(setBorders)
      .catch(() => setBorders(null));
  }, []);

  const layer = useMemo(() => {
    if (!borders) return null;
    const [min, max] = INDICATOR_META[indicator].domain;
    return new GeoJsonLayer({
      id: "choropleth",
      data: borders,
      pickable: true,
      stroked: true,
      filled: true,
      getFillColor: (f: Feature) => {
        const iso = (f.properties?.ISO_A3 as string) ?? "";
        const rec = indicators[iso];
        const v = rec?.[indicator];
        if (v == null) return [20, 23, 30, 120] as RGBA;
        return ramp((v - min) / (max - min));
      },
      getLineColor: (f: Feature) =>
        ((f.properties?.ISO_A3 as string) ?? "") === selectedIso
          ? ([255, 199, 0, 255] as RGBA)
          : ([60, 73, 78, 160] as RGBA),
      getLineWidth: (f: Feature) =>
        ((f.properties?.ISO_A3 as string) ?? "") === selectedIso ? 2.5 : 0.5,
      lineWidthUnits: "pixels",
      onClick: (info) => {
        const f = info.object as Feature | undefined;
        if (f?.properties) {
          onSelect(String(f.properties.ISO_A3 ?? ""), String(f.properties.NAME ?? f.properties.ADMIN ?? ""));
        }
      },
      updateTriggers: {
        getFillColor: [indicator, indicators],
        getLineColor: [selectedIso],
        getLineWidth: [selectedIso],
      },
    });
  }, [borders, indicator, indicators, selectedIso, onSelect]);

  return (
    <div className="relative h-full w-full">
      <DeckGL
        views={new MapView({ id: "choro", repeat: true })}
        initialViewState={{ longitude: 12, latitude: 28, zoom: 1.3, pitch: 0, bearing: 0 }}
        controller
        layers={layer ? [layer] : []}
        style={{ position: "absolute", inset: "0", background: "#0a0c10" }}
        getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
      />
      <Legend indicator={indicator} />
    </div>
  );
}

function Legend({ indicator }: { indicator: IndicatorKey }) {
  const meta = INDICATOR_META[indicator];
  return (
    <div className="pan-glass absolute bottom-3 left-3 z-10 px-3 py-2">
      <div className="label-caps text-[var(--color-on-surface)]">{meta.label}</div>
      <div
        className="mt-1.5 h-2 w-44"
        style={{ background: "linear-gradient(to right, #00d1ff, #ffc700, #ff4b2b)" }}
      />
      <div className="mt-1 flex justify-between">
        <span className="code-data text-[var(--color-outline)]">{meta.domain[0]}</span>
        <span className="label-caps text-[var(--color-outline)]">{meta.hint}</span>
        <span className="code-data text-[var(--color-outline)]">{meta.domain[1]}</span>
      </div>
    </div>
  );
}
