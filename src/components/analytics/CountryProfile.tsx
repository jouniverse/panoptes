"use client";

import { useQuery } from "@tanstack/react-query";
import { INDICATOR_META, type CountryIndicators, type IndicatorKey } from "@/config/indicators";
import { Stat, TacticalButton } from "@/components/ui/primitives";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { compact, fixed, toCSV, downloadFile } from "@/lib/format";

interface CountryData {
  iso: string;
  latest: {
    gdp?: number;
    population?: number;
    milExp?: number;
    milExpPctGdp?: number;
    personnel?: number;
  };
  series: { milExp: { year: number; value: number }[] };
}

export function CountryProfile({
  iso,
  name,
  indicators,
}: {
  iso: string;
  name: string;
  indicators?: CountryIndicators;
}) {
  const { data, isLoading, isError } = useQuery<CountryData>({
    queryKey: ["country", iso],
    queryFn: async () => {
      const r = await fetch(`/api/country?iso=${iso}`);
      if (!r.ok) throw new Error("country fetch failed");
      return r.json();
    },
    enabled: /^[A-Z]{3}$/.test(iso),
    staleTime: 24 * 3_600_000,
  });

  const exportCsv = () => {
    const rows: Record<string, unknown>[] = [];
    (Object.keys(INDICATOR_META) as IndicatorKey[]).forEach((k) => {
      if (indicators?.[k] != null)
        rows.push({ metric: INDICATOR_META[k].label, value: indicators[k] });
    });
    if (data?.latest) {
      rows.push({ metric: "GDP (USD)", value: data.latest.gdp ?? "" });
      rows.push({ metric: "Population", value: data.latest.population ?? "" });
      rows.push({ metric: "Military Expenditure (USD)", value: data.latest.milExp ?? "" });
      rows.push({ metric: "Mil. Exp. (% GDP)", value: data.latest.milExpPctGdp ?? "" });
      rows.push({ metric: "Armed Forces Personnel", value: data.latest.personnel ?? "" });
    }
    (data?.series.milExp ?? []).forEach((p) =>
      rows.push({ metric: `MilExp ${p.year}`, value: p.value }),
    );
    downloadFile(`panoptes-${iso}-profile.csv`, toCSV(rows));
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-outline-variant)] px-4 py-3">
        <div>
          <div className="label-caps text-[var(--color-outline)]">STRATEGIC PROFILE // {iso}</div>
          <h2 className="font-mono text-xl font-extrabold tracking-[0.06em] text-[var(--color-on-surface)]">
            {name || iso}
          </h2>
        </div>
        <TacticalButton onClick={exportCsv}>EXPORT CSV</TacticalButton>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="GDP" value={compact(data?.latest.gdp, { currency: true })} accent="var(--color-intel)" />
          <Stat label="Population" value={compact(data?.latest.population)} />
          <Stat
            label="Mil. Expenditure"
            value={compact(data?.latest.milExp, { currency: true })}
            accent="var(--color-gold)"
          />
          <Stat label="Mil. Exp / GDP" value={`${fixed(data?.latest.milExpPctGdp, 1)}%`} accent="var(--color-gold)" />
          <Stat label="Armed Personnel" value={compact(data?.latest.personnel)} />
          <Stat
            label="Peace Index"
            value={fixed(indicators?.gpi, 2)}
            accent="var(--color-alert)"
            sub={indicators?.gpiRank ? `rank #${indicators.gpiRank}` : undefined}
          />
        </div>

        <section className="mt-4 border border-[var(--color-outline-variant)] p-3">
          <div className="label-caps mb-2 text-[var(--color-on-surface-variant)]">
            MILITARY EXPENDITURE // USD (World Bank)
          </div>
          {isLoading && <div className="label-caps pan-pulse text-[var(--color-intel)]">QUERYING WORLD BANK…</div>}
          {isError && <div className="label-caps text-[var(--color-alert)]">SERIES UNAVAILABLE</div>}
          {data && data.series.milExp.length > 0 && (
            <TimeSeriesChart data={data.series.milExp} color="#ffc700" />
          )}
          {data && data.series.milExp.length === 0 && !isLoading && (
            <div className="label-caps text-[var(--color-outline)]">NO DATA REPORTED</div>
          )}
        </section>

        <section className="mt-4 border border-[var(--color-outline-variant)]">
          <div className="label-caps border-b border-[var(--color-outline-variant)] px-3 py-1.5">
            RISK & STABILITY INDICES
          </div>
          <table className="w-full">
            <tbody>
              {(Object.keys(INDICATOR_META) as IndicatorKey[]).map((k) => (
                <tr key={k} className="border-b border-[var(--color-grid)]">
                  <td className="px-3 py-1.5 font-mono text-[11px] text-[var(--color-on-surface-variant)]">
                    {INDICATOR_META[k].label}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <span className="code-data text-[var(--color-on-surface)]">
                      {indicators?.[k] != null ? fixed(indicators[k], 2) : "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
