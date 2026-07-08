"use client";

import { useQuery } from "@tanstack/react-query";
import {
  INDICATOR_META,
  INDICATOR_ORDER,
  type CountryIndicators,
  type IndicatorKey,
} from "@/config/indicators";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { Stat, TacticalButton } from "@/components/ui/primitives";
import { colorForIndex } from "@/lib/index-color";
import { formatIndicatorValue } from "@/lib/indicator-format";
import { compact, fixed, toCSV, downloadFile } from "@/lib/format";

interface CountryData {
  iso: string;
  latest: {
    gdp?: number;
    population?: number;
    milExp?: number;
    milExpPctGdp?: number;
    personnel?: number;
    gdpGrowth?: number;
    inflation?: number;
    currentAccount?: number;
    battleDeaths?: number;
    battleDeathsYear?: number;
    battleDeathsTracked?: boolean;
    homicideRate?: number;
    homicideYear?: number;
    homicideWorldRate?: number;
    homicideWorldYear?: number;
    armsImports?: number;
    armsImportsYear?: number;
    armsExports?: number;
    armsExportsYear?: number;
  };
  series: {
    milExp: { year: number; value: number }[];
    milExpPctGdp: { year: number; value: number }[];
    battleDeaths: { year: number; value: number }[];
    homicide: { year: number; value: number }[];
    homicideWorld: { year: number; value: number }[];
  };
  macro?: {
    gdpGrowth?: number;
    inflation?: number;
    currentAccount?: number;
  };
}

const WEAPON_TECH_ORDER = [
  "Assault Rifle",
  "Automatic machine gun",
  "Recoilless artillery",
  "Second gen. helicopter",
  "Third gen. MBT",
  "Fifth gen. jet fighter",
  "Armed UAV",
  "Intercontinetal ballistic missile",
];

export function CountryProfile({
  iso,
  name,
  indicators,
  averages,
}: {
  iso: string;
  name: string;
  indicators?: CountryIndicators;
  averages?: Partial<Record<IndicatorKey, number>>;
}) {
  const { data, isLoading, isError } = useQuery<CountryData>({
    queryKey: ["country", iso],
    queryFn: async () => {
      const r = await fetch(`/api/country?iso=${iso}`);
      const json = await r.json();
      if (!r.ok && !json.iso) throw new Error("country fetch failed");
      return {
        iso: json.iso ?? iso,
        latest: json.latest ?? {},
        series: {
          milExp: json.series?.milExp ?? [],
          milExpPctGdp: json.series?.milExpPctGdp ?? [],
          battleDeaths: json.series?.battleDeaths ?? [],
          homicide: json.series?.homicide ?? [],
          homicideWorld: json.series?.homicideWorld ?? [],
        },
        macro: json.macro ?? {},
      } as CountryData;
    },
    enabled: /^[A-Z]{3}$/.test(iso),
    staleTime: 30 * 24 * 3_600_000,
  });

  const cincQ = useQuery({
    queryKey: ["cinc-series", iso],
    queryFn: async () => {
      const all = (await fetch("/data/cow-cinc-series.json").then((r) => r.json())) as Record<
        string,
        { year: number; value: number }[]
      >;
      return all[iso] ?? [];
    },
    staleTime: Infinity,
  });

  const armsQ = useQuery({
    queryKey: ["cow-arms", iso],
    queryFn: async () => {
      const all = (await fetch("/data/cow-advanced-arms.json").then((r) => r.json())) as Record<
        string,
        Record<string, number>
      >;
      return all[iso] ?? {};
    },
    staleTime: Infinity,
  });

  const hapiQ = useQuery({
    queryKey: ["hapi-conflicts", iso],
    queryFn: async () => {
      const r = await fetch(`/api/hapi/conflicts?iso=${iso}`);
      const json = await r.json();
      if (!r.ok && !json.byType) throw new Error(json.error ?? "HAPI unavailable");
      return json as {
        byType: { type: string; label: string; events: number; fatalities: number }[];
        details: {
          eventType: string;
          periodStart?: string;
          periodEnd?: string;
          admin1?: string;
          events: number;
          fatalities: number;
        }[];
        startDate?: string;
        endDate?: string;
        totalEvents?: number;
        error?: string;
      };
    },
    staleTime: 24 * 3_600_000,
    retry: (failureCount, error) =>
      failureCount < 2 && String(error).toLowerCase().includes("rate limit"),
  });

  const macroQ = useQuery({
    queryKey: ["macro", iso],
    queryFn: async () => {
      const r = await fetch(`/api/macro?iso=${iso}`);
      const json = await r.json();
      return json as {
        bis?: {
          cbpr?: { value: number; period: string };
          creditToGdp?: { value: number; period: string };
          reer?: { value: number; period: string };
        };
        bop?: { valueUsd: number; valueMillions?: number; year: number; scale: string; unit: string } | null;
        error?: string;
      };
    },
    staleTime: 24 * 3_600_000,
  });

  const factbookQ = useQuery({
    queryKey: ["worldfactbook", iso],
    queryFn: async () => {
      const r = await fetch(`/api/worldfactbook?iso=${iso}`);
      if (r.status === 404) return null;
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "World Factbook unavailable");
      return json as {
        naturalResources?: string;
        industries?: string;
        exportsCommodities?: string;
        importsCommodities?: string;
      };
    },
    staleTime: 30 * 24 * 3_600_000,
  });

  const milExp = data?.series?.milExp ?? [];
  const battleDeaths = data?.series?.battleDeaths ?? [];
  const homicide = data?.series?.homicide ?? [];

  const exportCsv = () => {
    const rows: Record<string, unknown>[] = [];
    INDICATOR_ORDER.forEach((k) => {
      if (indicators?.[k] != null)
        rows.push({ metric: INDICATOR_META[k].label, value: indicators[k] });
    });
    if (data?.latest) {
      rows.push({ metric: "GDP (USD)", value: data.latest.gdp ?? "" });
      rows.push({ metric: "Population", value: data.latest.population ?? "" });
      rows.push({ metric: "Military Expenditure (USD)", value: data.latest.milExp ?? "" });
    }
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
          <Stat label="GDP" value={compact(data?.latest.gdp, { currency: true })} />
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
            accent={colorForIndex("gpi", indicators?.gpi)}
            sub={indicators?.gpiRank ? `rank #${indicators.gpiRank}` : undefined}
          />
        </div>

        <section className="mt-4 border border-[var(--color-outline-variant)] p-3">
          <div className="label-caps mb-2 text-[var(--color-on-surface-variant)]">
            MILITARY EXPENDITURE // USD (World Bank)
          </div>
          {isLoading && <div className="label-caps pan-pulse text-[var(--color-intel)]">QUERYING DATA360 / WDI…</div>}
          {isError && <div className="label-caps text-[var(--color-alert)]">SERIES UNAVAILABLE</div>}
          {data && milExp.length > 0 && (
            <TimeSeriesChart data={milExp} color="#ffc700" currency />
          )}
          {data && milExp.length === 0 && !isLoading && (
            <div className="label-caps text-[var(--color-outline)]">NO DATA REPORTED</div>
          )}
        </section>

        <section className="mt-4 border border-[var(--color-outline-variant)]">
          <div className="label-caps border-b border-[var(--color-outline-variant)] px-3 py-1.5">
            STRATEGIC INDICES
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="label-caps text-[var(--color-outline)]">
                <th className="px-3 py-1 text-left font-normal">Index</th>
                <th className="px-3 py-1 text-right font-normal">Value</th>
                <th className="px-3 py-1 text-right font-normal">Global avg</th>
              </tr>
            </thead>
            <tbody>
              {INDICATOR_ORDER.map((k) => {
                const v = indicators?.[k];
                const avg = averages?.[k];
                const color = colorForIndex(k, v);
                return (
                  <tr key={k} className="border-b border-[var(--color-grid)]">
                    <td className="px-3 py-1.5">
                      <div className="font-mono text-[var(--color-on-surface-variant)]">
                        {INDICATOR_META[k].short}
                      </div>
                      <div className="mt-0.5 text-[9px] leading-snug text-[var(--color-outline)]">
                        {INDICATOR_META[k].label}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <span
                        className="code-data rounded px-1"
                        style={color ? { color, background: `${color}22` } : undefined}
                      >
                        {v != null ? formatIndicatorValue(k, v) : "—"}
                      </span>
                    </td>
                    <td className="code-data px-3 py-1.5 text-right text-[var(--color-outline)]">
                      {avg != null ? formatIndicatorValue(k, avg) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <CollapsibleSection title="COMPOSITE INDEX OF NATIONAL CAPABILITY // CINC" defaultOpen>
          {cincQ.isLoading && (
            <div className="label-caps pan-pulse text-[var(--color-intel)]">LOADING COW SERIES…</div>
          )}
          {cincQ.data && cincQ.data.length > 0 && (
            <TimeSeriesChart
              data={cincQ.data}
              color="#00d1ff"
              valueScale={100}
              valueDecimals={3}
              valuePrefix=""
            />
          )}
          {cincQ.data && cincQ.data.length === 0 && (
            <div className="label-caps text-[var(--color-outline)]">NO CINC TIME SERIES</div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="ACCESS TO ADVANCED WEAPONS TECHNOLOGY // COW">
          <table className="w-full text-[11px]">
            <tbody>
              {WEAPON_TECH_ORDER.map((tech) => {
                const has = armsQ.data?.[tech];
                return (
                  <tr key={tech} className="border-b border-[var(--color-grid)]">
                    <td className="py-1 font-mono text-[var(--color-on-surface-variant)]">{tech}</td>
                    <td className="py-1 text-right">
                      <span
                        className={`code-data ${has ? "text-[var(--color-friendly)]" : "text-[var(--color-outline)]"}`}
                      >
                        {has == null ? "—" : has ? "YES" : "NO"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--color-grid)] pt-2">
            <Stat
              label={`Arms imports (SIPRI TIV${data?.latest.armsImportsYear ? ` · ${data.latest.armsImportsYear}` : ""})`}
              value={data?.latest.armsImports != null ? compact(data.latest.armsImports) : "—"}
            />
            <Stat
              label={`Arms exports (SIPRI TIV${data?.latest.armsExportsYear ? ` · ${data.latest.armsExportsYear}` : ""})`}
              value={data?.latest.armsExports != null ? compact(data.latest.armsExports) : "—"}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="BATTLE DEATHS // UCDP">
          {data?.latest.battleDeathsTracked && battleDeaths.length > 0 ? (
            <TimeSeriesChart data={battleDeaths} color="#ff4b2b" />
          ) : (
            <div className="label-caps text-[var(--color-outline)]">
              {isLoading ? "LOADING…" : "NO BATTLE DEATHS DATA"}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="CONFLICT EVENTS // HDX HAPI">
          {hapiQ.isLoading && (
            <div className="label-caps pan-pulse text-[var(--color-intel)]">QUERYING HAPI…</div>
          )}
          {hapiQ.isError && (
            <div className="label-caps text-[var(--color-outline)]">
              HAPI unavailable — set HAPI_APP_IDENTIFIER in .env
            </div>
          )}
          {hapiQ.data?.error && !hapiQ.isLoading && (
            <div className="label-caps text-[var(--color-outline)]">{hapiQ.data.error}</div>
          )}
          {hapiQ.data && !hapiQ.data.error && (
            <>
              <p className="mb-2 font-mono text-[11px] text-[var(--color-outline)]">
                {hapiQ.data.startDate} → {hapiQ.data.endDate}
                {hapiQ.data.totalEvents != null && (
                  <>
                    {" · "}
                    <span className="text-[var(--color-alert)]">
                      {hapiQ.data.totalEvents.toLocaleString()}
                    </span>{" "}
                    events (filtered types)
                  </>
                )}
              </p>
              <table className="mb-3 w-full text-[11px]">
                <thead>
                  <tr className="label-caps text-[var(--color-outline)]">
                    <th className="py-1 text-left font-normal">Event type</th>
                    <th className="py-1 text-right font-normal">Events</th>
                    <th className="py-1 text-right font-normal">Fatalities</th>
                  </tr>
                </thead>
                <tbody>
                  {(hapiQ.data.byType ?? []).map((row) => (
                    <tr key={row.type} className="border-t border-[var(--color-grid)]">
                      <td className="py-1 font-mono text-[var(--color-on-surface-variant)]">
                        {row.label}
                      </td>
                      <td className="code-data py-1 text-right">{row.events.toLocaleString()}</td>
                      <td className="code-data py-1 text-right">{row.fatalities.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(hapiQ.data.details?.length ?? 0) > 0 && (
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="text-[var(--color-outline)]">
                        <th className="py-1 text-left">Period</th>
                        <th className="py-1 text-left">Type</th>
                        <th className="py-1 text-left">Admin</th>
                        <th className="py-1 text-right">Ev</th>
                        <th className="py-1 text-right">Fat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hapiQ.data.details!.slice(0, 24).map((d, i) => (
                        <tr key={i} className="border-t border-[var(--color-grid)]">
                          <td className="py-0.5">{d.periodStart ?? "—"}</td>
                          <td className="py-0.5">{d.eventType}</td>
                          <td className="py-0.5 truncate max-w-[80px]" title={d.admin1}>
                            {d.admin1 ?? "—"}
                          </td>
                          <td className="py-0.5 text-right">{d.events}</td>
                          <td className="py-0.5 text-right">{d.fatalities}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="INTENTIONAL HOMICIDE RATE // per 100k (World Bank)">
          {data?.latest.homicideRate != null && (
            <div className="mb-2 grid grid-cols-2 gap-2">
              <Stat
                label={`Country (${data.latest.homicideYear ?? "—"})`}
                value={fixed(data.latest.homicideRate, 2)}
                accent="var(--color-alert)"
              />
              <Stat
                label={`World (${data.latest.homicideWorldYear ?? "—"})`}
                value={fixed(data.latest.homicideWorldRate, 2)}
              />
            </div>
          )}
          {homicide.length > 0 ? (
            <TimeSeriesChart data={homicide} color="#ff4b2b" />
          ) : (
            <div className="label-caps text-[var(--color-outline)]">
              {isLoading ? "FETCHING…" : "NO HOMICIDE DATA"}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="MACROECONOMIC INDICATORS">
          {macroQ.isLoading && (
            <div className="label-caps pan-pulse mb-2 text-[var(--color-intel)]">LOADING IMF / BIS…</div>
          )}
          <dl className="divide-y divide-[var(--color-grid)] font-mono text-[11px]">
            {(
              [
                ["GDP growth (annual %)", data?.macro?.gdpGrowth ?? data?.latest.gdpGrowth],
                ["Inflation (CPI, annual %)", data?.macro?.inflation ?? data?.latest.inflation],
                ["Current account balance (% GDP)", data?.macro?.currentAccount ?? data?.latest.currentAccount],
                [
                  macroQ.data?.bop
                    ? `Current account balance (IMF BOP · ${macroQ.data.bop.year})`
                    : "Current account balance (IMF BOP)",
                  macroQ.data?.bop?.valueUsd,
                  "bop",
                ],
                [
                  macroQ.data?.bis?.cbpr
                    ? `Central bank policy rate (${macroQ.data.bis.cbpr.period})`
                    : "Central bank policy rate (BIS)",
                  macroQ.data?.bis?.cbpr?.value,
                  "rate",
                ],
                [
                  macroQ.data?.bis?.creditToGdp
                    ? `Credit-to-GDP (${macroQ.data.bis.creditToGdp.period})`
                    : "Credit-to-GDP (BIS)",
                  macroQ.data?.bis?.creditToGdp?.value,
                  "pct",
                ],
                [
                  macroQ.data?.bis?.reer
                    ? `Effective exchange rate (${macroQ.data.bis.reer.period})`
                    : "Effective exchange rate (BIS)",
                  macroQ.data?.bis?.reer?.value,
                  "reer",
                ],
              ] as const
            ).map(([label, val, kind]) => (
              <div key={label} className="flex justify-between gap-2 py-1">
                <dt className="text-[var(--color-on-surface-variant)]">{label}</dt>
                <dd className="code-data text-[var(--color-on-surface)]">
                  {val == null
                    ? "—"
                    : kind === "bop"
                      ? compact(val as number, { currency: true })
                      : kind === "rate" || kind === "reer"
                        ? fixed(val as number, 2)
                        : `${fixed(val as number, 2)}%`}
                </dd>
              </div>
            ))}
          </dl>
        </CollapsibleSection>

        <CollapsibleSection title="MACROECONOMY // World Factbook">
          {factbookQ.isLoading && (
            <div className="label-caps pan-pulse text-[var(--color-intel)]">LOADING WORLD FACTBOOK…</div>
          )}
          {factbookQ.isError && (
            <div className="label-caps text-[var(--color-outline)]">WORLD FACTBOOK UNAVAILABLE</div>
          )}
          {!factbookQ.isLoading && !factbookQ.data && (
            <div className="label-caps text-[var(--color-outline)]">NO FACTBOOK PROFILE</div>
          )}
          {factbookQ.data && (
            <dl className="divide-y divide-[var(--color-grid)] font-mono text-[11px]">
              {(
                [
                  ["Natural resources", factbookQ.data.naturalResources],
                  ["Industries", factbookQ.data.industries],
                  ["Exports — commodities", factbookQ.data.exportsCommodities],
                  ["Imports — commodities", factbookQ.data.importsCommodities],
                ] as const
              ).map(([label, val]) => (
                <div key={label} className="py-2">
                  <dt className="label-caps mb-1 text-[var(--color-outline)]">{label}</dt>
                  <dd className="leading-relaxed text-[var(--color-on-surface-variant)]">
                    {val?.trim() ? val : "—"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}
