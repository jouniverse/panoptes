"use client";

import { useQuery } from "@tanstack/react-query";
import { SparkLine } from "@/components/ui/SparkLine";
import type { MetarObservation } from "@/app/api/metar/route";
import type { Sigmet } from "@/app/api/isigmet/route";

function fmtClouds(c?: MetarObservation["clouds"]): string {
  if (!c?.length) return "—";
  return c.map((x) => `${x.cover ?? "?"}${x.base != null ? `@${x.base}ft` : ""}`).join(", ");
}

function fmtUtc(ms?: number): string {
  if (ms == null) return "—";
  return (
    new Date(ms * 1000).toLocaleString("en-GB", {
      timeZone: "UTC",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }) + "Z"
  );
}

export function AirportWeather({
  icao,
  lon,
  lat,
  country,
}: {
  icao: string;
  lon: number;
  lat: number;
  country?: string;
}) {
  const metarQ = useQuery({
    queryKey: ["metar", icao],
    queryFn: async () => {
      const res = await fetch(`/api/metar?icao=${encodeURIComponent(icao)}`);
      if (!res.ok) throw new Error("METAR unavailable");
      return res.json() as Promise<{ observations: MetarObservation[] }>;
    },
    staleTime: 5 * 60_000,
  });

  const sigQ = useQuery({
    queryKey: ["sigmet", icao, country, lon, lat],
    queryFn: async () => {
      const q = new URLSearchParams({
        icao,
        lon: String(lon),
        lat: String(lat),
      });
      if (country) q.set("country", country);
      const res = await fetch(`/api/isigmet?${q}`);
      if (!res.ok) throw new Error("SIGMET unavailable");
      return res.json() as Promise<{ kind: "sigmet" | "isigmet"; sigmets: Sigmet[] }>;
    },
    staleTime: 10 * 60_000,
  });

  const sigLabel = sigQ.data?.kind === "sigmet" ? "SIGMET" : "ISIGMET";

  const obs = metarQ.data?.observations ?? [];
  const latest = obs.length ? obs[obs.length - 1] : null;
  const tempSeries = obs
    .filter((o) => o.obsTime != null && o.temp != null)
    .map((o) => ({ t: o.obsTime! * 1000, v: o.temp! }));

  return (
    <div className="mt-3 space-y-3">
      <div className="border border-[var(--color-outline-variant)]">
        <div className="label-caps border-b border-[var(--color-outline-variant)] px-2 py-1">
          METAR // {icao}
        </div>
        {metarQ.isLoading && (
          <p className="px-2 py-2 text-[11px] text-[var(--color-outline)]">Fetching AWC data…</p>
        )}
        {metarQ.isError && (
          <p className="px-2 py-2 text-[11px] text-[var(--color-outline)]">
            No public METAR for this ICAO (common for military-only fields).
          </p>
        )}
        {latest && (
          <>
            <dl className="divide-y divide-[var(--color-grid)] font-mono text-[10px]">
              {(
                [
                  ["temp", latest.temp != null ? `${latest.temp}°C` : "—"],
                  ["dewp", latest.dewp != null ? `${latest.dewp}°C` : "—"],
                  ["wdir", latest.wdir != null ? `${latest.wdir}°` : "—"],
                  ["wspd", latest.wspd != null ? `${latest.wspd} kt` : "—"],
                  ["visib", latest.visib ?? "—"],
                  ["altim", latest.altim != null ? `${latest.altim} hPa` : "—"],
                  ["clouds", fmtClouds(latest.clouds)],
                  ["rawOb", latest.rawOb ?? "—"],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 px-2 py-1">
                  <dt className="label-caps text-[var(--color-outline)]">{k}</dt>
                  <dd className="max-w-[65%] truncate text-right text-[var(--color-on-surface)]" title={String(v)}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            {tempSeries.length >= 2 && (
              <div className="border-t border-[var(--color-outline-variant)] px-2 py-2">
                <div className="label-caps mb-1 text-[var(--color-outline)]">TEMP (24H)</div>
                <SparkLine points={tempSeries} yFormat={(v) => `${v}°`} />
              </div>
            )}
            {obs.length > 1 && (
              <div className="max-h-32 overflow-y-auto border-t border-[var(--color-outline-variant)]">
                <table className="w-full font-mono text-[9px]">
                  <thead>
                    <tr className="text-[var(--color-outline)]">
                      <th className="px-2 py-1 text-left">TIME</th>
                      <th className="px-2 py-1 text-right">TEMP</th>
                      <th className="px-2 py-1 text-right">WSPD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...obs].reverse().slice(0, 12).map((o, i) => (
                      <tr key={i} className="border-t border-[var(--color-grid)]">
                        <td className="px-2 py-0.5">{fmtUtc(o.obsTime)}</td>
                        <td className="px-2 py-0.5 text-right">{o.temp ?? "—"}</td>
                        <td className="px-2 py-0.5 text-right">{o.wspd ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {!metarQ.isLoading && !metarQ.isError && obs.length === 0 && (
          <p className="px-2 py-2 text-[11px] text-[var(--color-outline)]">
            No METAR observations in the last 24 hours.
          </p>
        )}
      </div>

      {sigQ.data?.sigmets && sigQ.data.sigmets.length > 0 && (
        <div className="border border-[var(--color-alert)]">
          <div className="label-caps border-b border-[var(--color-alert)] px-2 py-1 text-[var(--color-alert)]">
            {sigLabel}
          </div>
          {sigQ.data.sigmets.map((s, i) => (
            <div key={i} className="border-t border-[var(--color-grid)] px-2 py-2 text-[10px] leading-relaxed">
              <div className="font-mono font-bold text-[var(--color-alert)]">
                {s.hazard ?? sigLabel} {s.firId ? `· ${s.firId}` : ""}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[var(--color-on-surface-variant)]">
                {s.rawText ?? s.qualifier ?? "—"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
