"use client";

import type { Feature } from "geojson";
import { Panel, StatusLight } from "@/components/ui/primitives";
import { useOpsFeed } from "@/hooks/useOpsFeed";
import { useSatellites } from "@/hooks/useSatellites";
import type { FeedHealth } from "@/core/types";

const pickFeatures = (j: unknown): Feature[] => (j as { features?: Feature[] }).features ?? [];

interface NewsItem {
  title: string;
  link: string;
  source: string;
  perspective: string;
  date?: string;
}
interface NgaWarn {
  id: string;
  navArea?: string;
  subregion?: string;
  text?: string;
  issueDate?: string;
}

export function OpsView() {
  const flights = useOpsFeed<Feature>("flights", "/api/flights", pickFeatures, 30_000);
  const vessels = useOpsFeed<Feature>("vessels", "/api/vessels", pickFeatures, 60_000);
  const news = useOpsFeed<NewsItem>(
    "news",
    "/api/news",
    (j) => (j as { items?: NewsItem[] }).items ?? [],
    10 * 60_000,
  );
  const nga = useOpsFeed<NgaWarn>(
    "nga",
    "/api/nga",
    (j) => (j as { warnings?: NgaWarn[] }).warnings ?? [],
    30 * 60_000,
  );
  const sats = useSatellites("stations");

  const sources: { name: string; health: FeedHealth; count: number }[] = [
    { name: "ADS-B MIL (adsb.lol)", health: flights.health, count: flights.items.length },
    { name: "AIS VESSELS (aisstream)", health: vessels.health, count: vessels.items.length },
    { name: "ORBITAL (celestrak)", health: sats.health as FeedHealth, count: sats.positions.length },
    { name: "MARITIME WARN (nga)", health: nga.health, count: nga.items.length },
    { name: "NEWS RSS (6 sources)", health: news.health, count: news.items.length },
  ];

  return (
    <div className="pan-grid min-w-0 flex-1 overflow-y-auto p-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* source health */}
        <Panel title="SOURCE HEALTH" className="lg:col-span-1">
          <ul className="divide-y divide-[var(--color-grid)]">
            {sources.map((s) => (
              <li key={s.name} className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2">
                  <StatusLight state={s.health} pulse />
                  <span className="font-mono text-[11px] text-[var(--color-on-surface)]">{s.name}</span>
                </div>
                <span className="code-data text-[var(--color-outline)]">
                  {s.health.toUpperCase()} · {s.count}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-[var(--color-outline-variant)] p-3">
            <div className="label-caps text-[var(--color-outline)]">
              Feeds report freshness explicitly. STALE/DEGRADED = last good snapshot shown.
            </div>
          </div>
        </Panel>

        {/* aviation */}
        <Panel title="AVIATION // MIL ADS-B" status={flights.health} className="lg:col-span-1">
          <FeatureList
            features={flights.items}
            cols={(p) => [String(p.callsign ?? p.hex ?? "—"), `${p.type ?? ""} ${p.altitude ?? ""}`]}
            empty="No military aircraft in view"
          />
        </Panel>

        {/* maritime */}
        <Panel title="MARITIME // AIS" status={vessels.health} className="lg:col-span-1">
          <FeatureList
            features={vessels.items}
            cols={(p) => [String(p.label ?? p.mmsi ?? "—"), `${p.sog_kt ?? "—"} kt`]}
            empty="No vessel stream (needs AIS_STREAM_KEY)"
          />
        </Panel>

        {/* space */}
        <Panel title="SPACE // ORBITAL (LIVE PROPAGATION)" status={sats.health as FeedHealth} className="lg:col-span-1">
          <div className="px-3 py-2">
            <span className="font-mono text-2xl font-bold text-[var(--color-intel)]">
              {sats.positions.length}
            </span>
            <span className="label-caps ml-2 text-[var(--color-outline)]">OBJECTS TRACKED</span>
          </div>
          <ul className="max-h-56 divide-y divide-[var(--color-grid)] overflow-y-auto">
            {sats.positions.slice(0, 40).map((s) => (
              <li key={s.name} className="flex items-center justify-between px-3 py-1">
                <span className="truncate font-mono text-[11px] text-[var(--color-on-surface)]">{s.name}</span>
                <span className="code-data text-[var(--color-outline)]">
                  {s.lat.toFixed(1)},{s.lon.toFixed(1)} · {s.alt.toFixed(0)}km
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* maritime alerts */}
        <Panel title="MARITIME ALERTS // NGA MSI" status={nga.health} className="lg:col-span-1">
          <ul className="max-h-72 divide-y divide-[var(--color-grid)] overflow-y-auto">
            {nga.items.slice(0, 30).map((w) => (
              <li key={w.id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="label-caps text-[var(--color-gold)]">{w.navArea ?? "—"}</span>
                  <span className="label-caps text-[var(--color-outline)]">{w.subregion}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 font-mono text-[11px] text-[var(--color-on-surface-variant)]">
                  {w.text}
                </p>
              </li>
            ))}
            {!nga.items.length && <Empty label="No active warnings" />}
          </ul>
        </Panel>

        {/* news */}
        <Panel title="NEWS // MULTI-PERSPECTIVE RSS" status={news.health} className="lg:col-span-1">
          <ul className="max-h-72 divide-y divide-[var(--color-grid)] overflow-y-auto">
            {news.items.slice(0, 40).map((n, i) => (
              <li key={`${n.link}-${i}`} className="px-3 py-2 hover:bg-[rgba(0,209,255,0.05)]">
                <a href={n.link} target="_blank" rel="noopener noreferrer" className="block">
                  <div className="flex items-center gap-2">
                    <span className="label-caps text-[var(--color-intel)]">{n.perspective}</span>
                    <span className="label-caps text-[var(--color-outline)]">{n.source}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 font-mono text-[11px] text-[var(--color-on-surface)]">
                    {n.title}
                  </p>
                </a>
              </li>
            ))}
            {!news.items.length && <Empty label="Loading feeds…" />}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function FeatureList({
  features,
  cols,
  empty,
}: {
  features: Feature[];
  cols: (p: Record<string, unknown>) => [string, string];
  empty: string;
}) {
  if (!features.length) return <Empty label={empty} />;
  return (
    <ul className="max-h-72 divide-y divide-[var(--color-grid)] overflow-y-auto">
      {features.slice(0, 60).map((f, i) => {
        const [a, b] = cols((f.properties ?? {}) as Record<string, unknown>);
        return (
          <li key={i} className="flex items-center justify-between px-3 py-1">
            <span className="truncate font-mono text-[11px] text-[var(--color-on-surface)]">{a}</span>
            <span className="code-data text-[var(--color-outline)]">{b}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ label }: { label: string }) {
  return <li className="label-caps px-3 py-6 text-center text-[var(--color-outline)]">{label}</li>;
}
