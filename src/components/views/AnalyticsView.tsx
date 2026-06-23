"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  INDICATOR_META,
  type CountryIndicators,
  type IndicatorKey,
} from "@/config/indicators";
import { CountryProfile } from "@/components/analytics/CountryProfile";
import { fixed } from "@/lib/format";

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

export function AnalyticsView() {
  const [indicators, setIndicators] = useState<Record<string, CountryIndicators>>({});
  const [indicator, setIndicator] = useState<IndicatorKey>("gpi");
  const [selected, setSelected] = useState<{ iso: string; name: string }>({
    iso: "RUS",
    name: "Russia",
  });
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/data/country-indicators.json")
      .then((r) => r.json())
      .then(setIndicators)
      .catch(() => setIndicators({}));
  }, []);

  const ranked = useMemo(() => {
    const list = Object.values(indicators).filter((c) => c[indicator] != null);
    list.sort((a, b) => (b[indicator] as number) - (a[indicator] as number));
    const q = search.trim().toLowerCase();
    return q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
  }, [indicators, indicator, search]);

  return (
    <div className="flex min-w-0 flex-1">
      {/* left: indicator + ranked list */}
      <aside className="pan-glass flex w-[248px] shrink-0 flex-col border-r border-[var(--color-outline-variant)]">
        <div className="border-b border-[var(--color-outline-variant)] p-3">
          <div className="headline-sm text-[var(--color-on-surface)]">STRATEGIC INDEX</div>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {(Object.keys(INDICATOR_META) as IndicatorKey[]).map((k) => (
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
                <span className="code-data text-[var(--color-gold)]">{fixed(c[indicator], 1)}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* center: choropleth */}
      <div className="relative min-w-0 flex-1">
        <ChoroplethMap
          indicator={indicator}
          indicators={indicators}
          selectedIso={selected.iso}
          onSelect={(iso, name) => setSelected({ iso, name })}
        />
      </div>

      {/* right: profile */}
      <aside className="pan-glass w-[380px] shrink-0 border-l border-[var(--color-outline-variant)]">
        <CountryProfile iso={selected.iso} name={selected.name} indicators={indicators[selected.iso]} />
      </aside>
    </div>
  );
}
