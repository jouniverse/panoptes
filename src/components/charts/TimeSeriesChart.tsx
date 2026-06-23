"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import { PALETTE } from "@/config/theme";

export interface SeriesPoint {
  year: number;
  value: number;
}

export function TimeSeriesChart({
  data,
  color = PALETTE.intel,
  height = 160,
}: {
  data: SeriesPoint[];
  color?: string;
  height?: number;
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
      },
      grid: {
        vertLines: { color: "rgba(60,73,78,0.3)" },
        horzLines: { color: "rgba(60,73,78,0.3)" },
      },
      rightPriceScale: { borderColor: PALETTE.outlineVariant },
      timeScale: { borderColor: PALETTE.outlineVariant, fixLeftEdge: true },
      crosshair: { mode: 0 },
      handleScroll: false,
      handleScale: false,
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
  }, [height, color]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      data.map((d) => ({ time: `${d.year}-01-01`, value: d.value })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
