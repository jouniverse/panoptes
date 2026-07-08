"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  INDICATOR_META,
  INDICATOR_ORDER,
  type CountryIndicators,
  type IndicatorKey,
} from "@/config/indicators";
import { CountryProfile } from "@/components/analytics/CountryProfile";
import { formatIndicatorValue } from "@/lib/indicator-format";

const ChoroplethMap = dynamic(
  () => import("@/components/analytics/ChoroplethMap").then((m) => m.ChoroplethMap),
  { ssr: false, loading: () => <Loading label="RENDERING CHOROPLETH" /> },
);

function Loading({ label }: { label: string }) {
  return (
    <div className="pan-grid flex h-full items-center justify-center">
      <span className="label-caps pan-pulse text-[var(--color-intel)]">{label}</span>
    </div>
  );
}

interface IndicatorPayload {
  countries: Record<string, CountryIndicators>;
  averages?: Partial<Record<IndicatorKey, number>>;
}

function parseIndicatorFile(json: unknown): {
  countries: Record<string, CountryIndicators>;
  averages: Partial<Record<IndicatorKey, number>>;
} {
  if (json && typeof json === "object" && "countries" in json) {
    const wrapped = json as IndicatorPayload;
    const sample = Object.values(wrapped.countries ?? {})[0];
    if (sample && typeof sample === "object" && "iso" in sample) {
      return { countries: wrapped.countries, averages: wrapped.averages ?? {} };
    }
  }
  return { countries: (json as Record<string, CountryIndicators>) ?? {}, averages: {} };
}

export function AnalyticsView() {
  const [countries, setCountries] = useState<Record<string, CountryIndicators>>({});
  const [averages, setAverages] = useState<Partial<Record<IndicatorKey, number>>>({});
  const [indicator, setIndicator] = useState<IndicatorKey>("gpi");
  const [selected, setSelected] = useState<{ iso: string; name: string }>({
    iso: "RUS",
    name: "Russia",
  });
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/data/country-indicators.json")
      .then((r) => r.json())
      .then((json: unknown) => {
        const { countries: c, averages: a } = parseIndicatorFile(json);
        setCountries(c);
        setAverages(a);
      })
      .catch(() => setCountries({}));
  }, []);

  const ranked = useMemo(() => {
    const meta = INDICATOR_META[indicator];
    const list = Object.values(countries).filter((c) => c[indicator] != null);
    list.sort((a, b) => {
      const diff = (b[indicator] as number) - (a[indicator] as number);
      return meta.rankHigherFirst !== false ? diff : -diff;
    });
    const q = search.trim().toLowerCase();
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  }, [countries, indicator, search]);

  return (
    <div className="flex min-w-0 flex-1">
      <aside className="pan-glass flex w-[248px] shrink-0 flex-col border-r border-[var(--color-outline-variant)]">
        <div className="border-b border-[var(--color-outline-variant)] p-3">
          <div className="headline-sm text-[var(--color-on-surface)]">STRATEGIC INDEX</div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {INDICATOR_ORDER.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setIndicator(k)}
                title={INDICATOR_META[k].label}
                className={`border px-1 py-1 font-mono text-[9px] font-bold tracking-[0.1em] transition-colors ${
                  indicator === k
                    ? "border-[var(--color-intel)] text-[var(--color-intel)]"
                    : "border-[var(--color-outline-variant)] text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
                }`}
              >
                {INDICATOR_META[k].short}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="FILTER COUNTRIES…"
            className="mt-2 w-full border border-[var(--color-outline-variant)] bg-transparent px-2 py-1 font-mono text-[11px] text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:border-[var(--color-intel)] focus:outline-none"
          />
        </div>
        <ul className="flex-1 overflow-y-auto">
          {ranked.map((c, i) => (
            <li key={c.iso}>
              <button
                type="button"
                onClick={() => setSelected({ iso: c.iso, name: c.name })}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[rgba(0,209,255,0.06)] ${
                  selected.iso === c.iso ? "bg-[rgba(0,209,255,0.1)]" : ""
                }`}
              >
                <span className="code-data w-6 text-[var(--color-outline)]">{i + 1}</span>
                <span className="flex-1 truncate font-mono text-[11px] text-[var(--color-on-surface)]">
                  {c.name}
                </span>
                <span className="code-data text-[var(--color-gold)]">
                  {formatIndicatorValue(indicator, c[indicator])}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="relative min-w-0 flex-1">
        <ChoroplethMap
          indicator={indicator}
          indicators={countries}
          selectedIso={selected.iso}
          onSelect={(iso, name) => setSelected({ iso, name })}
        />
      </div>

      <aside className="pan-glass w-[380px] shrink-0 border-l border-[var(--color-outline-variant)]">
        <CountryProfile
          iso={selected.iso}
          name={selected.name}
          indicators={countries[selected.iso]}
          averages={averages}
        />
      </aside>
    </div>
  );
}
