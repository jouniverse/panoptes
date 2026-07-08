"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, type IChartApi } from "lightweight-charts";
import { Panel } from "@/components/ui/primitives";
import type { FeedHealth } from "@/core/types";
import type { SpaceWeatherPayload } from "@/lib/space-weather";
import { kpColor, kpHint } from "@/lib/space-weather";
import { fixed } from "@/lib/format";
import { Empty } from "./ops-utils";

function MetricChip({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 flex-1 rounded border border-[var(--color-grid)] px-2 py-1.5">
      <div className="label-caps text-[9px] text-[var(--color-outline)]">{label}</div>
      <div className="font-mono text-lg font-bold leading-tight" style={{ color: color ?? "var(--color-on-surface)" }}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[9px] leading-snug text-[var(--color-outline)]">{hint}</div>}
    </div>
  );
}

function SingleForecastChart({
  points,
  color,
  title,
}: {
  points: { time: string; value: number }[];
  color: string;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current || !points.length) return;
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 88,
      layout: { background: { color: "transparent" }, textColor: "#8a9199", attributionLogo: false },
      grid: { vertLines: { color: "#1a2332" }, horzLines: { color: "#1a2332" } },
      rightPriceScale: { borderColor: "#2a3544" },
      timeScale: { borderColor: "#2a3544" },
    });
    chartRef.current = chart;

    const sliced = points.slice(0, 45);
    const chartData = sliced.map((p) => ({
      time: p.time.slice(0, 10) as `${number}-${number}-${number}`,
      value: p.value,
    }));

    const s = chart.addSeries(LineSeries, {
      color,
      lineWidth: 1,
      title,
      lastValueVisible: true,
      priceLineVisible: false,
    });
    s.setData(chartData);

    if (chartData.length) {
      // s.createPriceLine({
      //   price: chartData[0].value,
      //   color,
      //   lineWidth: 1,
      //   lineStyle: 2,
      //   axisLabelVisible: true,
      //   title: "now",
      // });
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (ref.current) chart.applyOptions({ width: ref.current.clientWidth });
    });
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [points, color, title]);

  if (!points.length) return null;
  return <div ref={ref} className="w-full min-w-0" />;
}

export function OpsSpaceWeatherPanel({
  payload,
  health,
}: {
  payload?: SpaceWeatherPayload & { error?: string };
  health: FeedHealth;
}) {
  const [tab, setTab] = useState<"weather" | "alerts">("weather");

  if (!payload || payload.error) {
    return (
      <Panel title="SPACE WEATHER // NOAA SWPC" status={health} className="lg:col-span-1">
        <Empty label={payload?.error ?? "Loading space weather…"} />
      </Panel>
    );
  }

  const kp = payload.kp ?? 0;
  const apCurrent = payload.ap[0];
  const f107Current = payload.f107[0];

  return (
    <Panel title="SPACE WEATHER // NOAA SWPC" status={health} className="lg:col-span-1">
      <div className="flex border-b border-[var(--color-grid)]">
        {(["weather", "alerts"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`label-caps flex-1 px-2 py-1.5 text-[10px] ${
              tab === t
                ? "bg-[rgba(0,209,255,0.1)] text-[var(--color-intel)]"
                : "text-[var(--color-outline)] hover:text-[var(--color-on-surface-variant)]"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "weather" ? "Weather" : "Alerts"}
          </button>
        ))}
      </div>

      {tab === "weather" ? (
        <>
          <div className="flex gap-2 border-b border-[var(--color-grid)] px-3 py-2">
            <MetricChip
              label="Planetary Kp"
              value={payload.kp != null ? fixed(kp, 2) : "—"}
              color={payload.kp != null ? kpColor(kp) : undefined}
              hint={payload.kp != null ? kpHint(kp) : payload.kpTime ? `as of ${payload.kpTime}` : undefined}
            />
            <MetricChip
              label="Ap (today)"
              value={apCurrent ? fixed(apCurrent.value, 0) : "—"}
              color="#00d1ff"
              hint={apCurrent?.time}
            />
            <MetricChip
              label="F10.7 (today)"
              value={f107Current ? fixed(f107Current.value, 1) : "—"}
              color="#ffc700"
              hint={f107Current?.time}
            />
          </div>
          {(payload.ap.length > 0 || payload.f107.length > 0) && (
            <div className="space-y-1 px-1 py-1">
              {payload.ap.length > 0 && (
                <div>
                  <div className="label-caps px-2 py-0.5 text-[var(--color-outline)]">45-DAY Ap</div>
                  <SingleForecastChart points={payload.ap} color="#00d1ff" title="Ap" />
                </div>
              )}
              {payload.f107.length > 0 && (
                <div>
                  <div className="label-caps px-2 py-0.5 text-[var(--color-outline)]">45-DAY F10.7</div>
                  <SingleForecastChart points={payload.f107} color="#ffc700" title="F10.7" />
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <ul className="max-h-72 divide-y divide-[var(--color-grid)] overflow-y-auto">
          {payload.alerts.map((a, i) => (
            <li key={i} className="px-3 py-1.5">
              <div className="label-caps text-[var(--color-outline)]">{a.time ?? "—"}</div>
              <p className="line-clamp-2 font-mono text-[10px] text-[var(--color-on-surface-variant)]">{a.title}</p>
            </li>
          ))}
          {!payload.alerts.length && <Empty label="No active SWPC alerts" />}
        </ul>
      )}
    </Panel>
  );
}
