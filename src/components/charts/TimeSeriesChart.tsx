"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { PALETTE } from "@/config/theme";
import { compact } from "@/lib/format";

export interface SeriesPoint {
  year: number;
  value: number;
}

export function TimeSeriesChart({
  data,
  color = PALETTE.intel,
  height = 160,
  valuePrefix,
  currency,
  valueScale = 1,
  valueDecimals,
}: {
  data: SeriesPoint[];
  color?: string;
  height?: number;
  valuePrefix?: string;
  currency?: boolean;
  /** Multiply stored values before display (e.g. CINC × 100). */
  valueScale?: number;
  valueDecimals?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      height,
      layout: {
        background: { color: "transparent" },
        textColor: PALETTE.onSurfaceVariant,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(60,73,78,0.3)" },
        horzLines: { color: "rgba(60,73,78,0.3)" },
      },
      rightPriceScale: {
        borderColor: PALETTE.outlineVariant,
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: { borderColor: PALETTE.outlineVariant, fixLeftEdge: true },
      crosshair: { mode: 1 },
      handleScroll: false,
      handleScale: false,
      localization: {
        priceFormatter: (p: number) => {
          if (currency) return compact(p, { currency: true });
          if (Math.abs(p) >= 1e6) return compact(p);
          if (Math.abs(p) >= 1000) return `${(p / 1000).toFixed(1)}k`;
          const d = valueDecimals ?? (Math.abs(p) < 10 ? 2 : 0);
          return `${valuePrefix ?? ""}${p.toFixed(d)}`;
        },
      },
    });
    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    });
    ro.observe(ref.current);
    chart.applyOptions({ width: ref.current.clientWidth });

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, color, currency, valuePrefix, valueScale, valueDecimals]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      data.map((d) => ({
        time: `${d.year}-01-01`,
        value: d.value * valueScale,
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [data, valueScale]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
