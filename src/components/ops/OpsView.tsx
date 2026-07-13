"use client";

import { useOpsFeed } from "@/hooks/useOpsFeed";
import { useSatellites } from "@/hooks/useSatellites";
import { useVessels } from "@/hooks/useVessels";
import type { FeedHealth } from "@/core/types";
import { pickFeatures } from "./ops-utils";
import { OpsMapPanel } from "./OpsMapPanel";
import { OpsDetailsPanel } from "./OpsDetailsPanel";
import { OpsAviationPanel } from "./OpsAviationPanel";
import { OpsAviationNewsPanel } from "./OpsAviationNewsPanel";
import { OpsMaritimeAisPanel } from "./OpsMaritimeAisPanel";
import { OpsMaritimeAlertsPanel } from "./OpsMaritimeAlertsPanel";
import { OpsNavalNewsPanel } from "./OpsNavalNewsPanel";
import { OpsSpaceOrbitalPanel } from "./OpsSpaceOrbitalPanel";
import { OpsSpaceNewsPanel } from "./OpsSpaceNewsPanel";
import { OpsSpaceWeatherPanel } from "./OpsSpaceWeatherPanel";
import { OpsNewsPanel } from "./OpsNewsPanel";
import { OpsEconomicsPanel } from "./OpsEconomicsPanel";
import { OpsTradePanel } from "./OpsTradePanel";
import { OpsSourceHealthPanel } from "./OpsSourceHealthPanel";

export function OpsView() {
  const flights = useOpsFeed("flights", "/api/flights", pickFeatures, 30_000);
  const alerts = useOpsFeed("maritime-alerts", "/api/maritime-alerts", pickFeatures, 30 * 60_000);
  const news = useOpsFeed("news", "/api/news", (j) => (j as { items?: unknown[] }).items ?? [], 10 * 60_000);
  const navalNews = useOpsFeed("naval-news", "/api/ops/naval-news", (j) => (j as { items?: unknown[] }).items ?? [], 15 * 60_000);
  const aviationNews = useOpsFeed(
    "aviation-news",
    "/api/ops/aviation-news",
    (j) => (j as { items?: unknown[] }).items ?? [],
    15 * 60_000,
  );
  const spaceNews = useOpsFeed("space-news", "/api/ops/space-news", (j) => [j], 15 * 60_000);
  const spaceWeather = useOpsFeed("space-weather", "/api/ops/space-weather", (j) => [j], 60 * 60_000);
  const eia = useOpsFeed("eia", "/api/ops/eia", (j) => [j], 24 * 60 * 60_000);
  const trade = useOpsFeed("trade", "/api/ops/trade", (j) => [j], 24 * 60 * 60_000);
  const sats = useSatellites("gov-military");
  const ais = useVessels({ enabled: true });

  const spaceNewsPayload = spaceNews.items[0] as { news?: unknown[]; launches?: unknown[] } | undefined;

  const sources = [
    { name: "MIL ADS-B (IntelSky + adsb.lol)", health: flights.health, count: flights.items.length },
    { name: "MARITIME ALERTS (NGA MSI)", health: alerts.health, count: alerts.items.length },
    { name: "ORBITAL (gov/mil)", health: sats.health as FeedHealth, count: sats.positions.length },
    { name: "AVIATION NEWS RSS", health: aviationNews.health, count: aviationNews.items.length },
    { name: "SPACE NEWS + LAUNCHES", health: spaceNews.health, count: (spaceNewsPayload?.news?.length ?? 0) + (spaceNewsPayload?.launches?.length ?? 0) },
    { name: "NAVAL NEWS RSS", health: navalNews.health, count: navalNews.items.length },
    { name: "SPACE WEATHER (NOAA)", health: spaceWeather.health, count: spaceWeather.items.length && !(spaceWeather.items[0] as { error?: string })?.error ? 1 : 0 },
    { name: "NEWS RSS (6 sources)", health: news.health, count: news.items.length },
    { name: "MARKETS (Yahoo)", health: "live" as FeedHealth, count: 0 },
    { name: "EIA (oil & energy)", health: eia.health, count: (eia.items[0] as { series?: unknown[] })?.series?.length ?? 0 },
    { name: "TRADE INDICATORS", health: trade.health, count: trade.items.length && !(trade.items[0] as { error?: string })?.error ? 1 : 0 },
    { name: "AIS VESSELS (AISStream)", health: ais.health, count: ais.count },
  ];

  return (
    <div className="pan-grid pan-scroll-y min-h-0 min-w-0 flex-1 self-stretch p-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <OpsMapPanel />
        <OpsDetailsPanel />
        <OpsAviationPanel features={flights.items} health={flights.health} />
        <OpsAviationNewsPanel items={aviationNews.items as never[]} health={aviationNews.health} />
        <OpsMaritimeAisPanel vessels={ais.rawVessels} health={ais.health} />
        <OpsMaritimeAlertsPanel features={alerts.items} health={alerts.health} />
        <OpsNavalNewsPanel items={navalNews.items as never[]} health={navalNews.health} />
        <OpsSpaceOrbitalPanel positions={sats.positions} health={sats.health as FeedHealth} />
        <OpsSpaceNewsPanel
          news={(spaceNewsPayload?.news ?? []) as never[]}
          launches={(spaceNewsPayload?.launches ?? []) as never[]}
          health={spaceNews.health}
        />
        <OpsSpaceWeatherPanel payload={spaceWeather.items[0] as never} health={spaceWeather.health} />
        <OpsNewsPanel items={news.items as never[]} health={news.health} />
        <OpsEconomicsPanel eia={eia.items[0] as never} eiaHealth={eia.health} />
        <OpsTradePanel payload={trade.items[0] as never} health={trade.health} />
        <OpsSourceHealthPanel sources={sources} />
      </div>
    </div>
  );
}
