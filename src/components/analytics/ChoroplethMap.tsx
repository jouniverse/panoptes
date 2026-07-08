"use client";

import { useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { MapView } from "@deck.gl/core";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection } from "geojson";
import { INDICATOR_META, type CountryIndicators, type IndicatorKey } from "@/config/indicators";
import { indexRamp, riskT } from "@/lib/index-color";
import { formatIndicatorValue } from "@/lib/indicator-format";

function ramp(t: number): [number, number, number, number] {
  const [r, g, b] = indexRamp(t);
  return [r, g, b, 200];
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
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    name: string;
    iso: string;
    value?: number;
  } | null>(null);

  useEffect(() => {
    fetch("/geo/country-borders.geojson")
      .then((r) => r.json())
      .then(setBorders)
      .catch(() => setBorders(null));
  }, []);

  const layer = useMemo(() => {
    if (!borders) return null;
    const colored: FeatureCollection = {
      type: "FeatureCollection",
      features: borders.features.map((f) => {
        const iso = (f.properties?.ISO_A3 as string) ?? "";
        const v = indicators[iso]?.[indicator];
        const fillColor: [number, number, number, number] =
          v == null ? [20, 23, 30, 120] : ramp(riskT(indicator, v));
        return {
          ...f,
          properties: { ...f.properties, _fill: fillColor },
        };
      }),
    };
    return new GeoJsonLayer({
      id: `choropleth-${indicator}`,
      data: colored,
      pickable: true,
      stroked: true,
      filled: true,
      getFillColor: (f: Feature) =>
        (f.properties?._fill as [number, number, number, number]) ?? [20, 23, 30, 120],
      getLineColor: (f: Feature) =>
        ((f.properties?.ISO_A3 as string) ?? "") === selectedIso
          ? ([255, 199, 0, 255] as [number, number, number, number])
          : ([60, 73, 78, 160] as [number, number, number, number]),
      getLineWidth: (f: Feature) =>
        ((f.properties?.ISO_A3 as string) ?? "") === selectedIso ? 2.5 : 0.5,
      lineWidthUnits: "pixels",
      onClick: (info) => {
        const f = info.object as Feature | undefined;
        if (f?.properties) {
          onSelect(String(f.properties.ISO_A3 ?? ""), String(f.properties.NAME ?? f.properties.ADMIN ?? ""));
        }
      },
      onHover: (info) => {
        const f = info.object as Feature | undefined;
        if (f?.properties && info.x != null && info.y != null) {
          const iso = String(f.properties.ISO_A3 ?? "");
          setHover({
            x: info.x,
            y: info.y,
            iso,
            name: String(f.properties.NAME ?? f.properties.ADMIN ?? iso),
            value: indicators[iso]?.[indicator],
          });
        } else {
          setHover(null);
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
        getCursor={() => "crosshair"}
      />
      {hover && (
        <div
          className="pan-glass pointer-events-none absolute z-20 px-2 py-1 font-mono text-[10px]"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-bold text-[var(--color-on-surface)]">{hover.name}</div>
          <div className="text-[var(--color-outline)]">
            {hover.iso}
            {hover.value != null && (
              <>
                {" · "}
                <span className="text-[var(--color-gold)]">
                  {formatIndicatorValue(indicator, hover.value)}
                </span>
              </>
            )}
          </div>
        </div>
      )}
      <Legend indicator={indicator} />
    </div>
  );
}

function Legend({ indicator }: { indicator: IndicatorKey }) {
  const meta = INDICATOR_META[indicator];
  const [lo, hi] = meta.domain;
  const gradient = meta.higherIsBetter
    ? "linear-gradient(to right, #ff4b2b, #ffc700, #00d1ff)"
    : "linear-gradient(to right, #00d1ff, #ffc700, #ff4b2b)";
  return (
    <div className="pan-glass absolute bottom-3 left-3 z-10 max-w-[220px] px-3 py-2">
      <div className="label-caps text-[var(--color-on-surface)]">{meta.label}</div>
      <div className="relative mt-2">
        <div className="h-2.5 w-full rounded-sm" style={{ background: gradient }} />
        <div className="mt-0.5 flex justify-between">
          <span className="code-data text-[10px] text-[var(--color-outline)]">{lo}</span>
          <span className="code-data text-[10px] text-[var(--color-outline)]">{hi}</span>
        </div>
      </div>
      <p className="label-caps mt-1.5 text-center text-[10px] leading-snug text-[var(--color-outline)]">
        {meta.hint}
      </p>
    </div>
  );
}
