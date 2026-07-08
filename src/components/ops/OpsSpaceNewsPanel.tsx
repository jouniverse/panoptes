"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/primitives";
import { useOpsStore } from "@/core/state/ops-store";
import type { FeedHealth } from "@/core/types";
import type { SpaceLaunchItem } from "@/lib/space-launches";
import { Empty } from "./ops-utils";

export interface SpaceNewsItem {
  title: string;
  link: string;
  source: string;
  date?: string;
}

function launchProps(l: SpaceLaunchItem): Record<string, unknown> {
  const agencies = (l.agencies ?? [])
    .map((a) => `${a.name}${a.country_code ? ` (${a.country_code})` : ""}`)
    .join(" · ");
  return {
    window_start: l.window_start,
    window_end: l.window_end,
    last_updated: l.last_updated,
    provider: l.provider,
    provider_type: l.provider_type,
    rocket: l.rocket_full_name ?? l.rocket_name,
    rocket_family: l.rocket_family,
    mission_name: l.mission_name,
    mission_type: l.mission_type,
    mission_description: l.mission_description,
    orbit: l.orbit_name ? `${l.orbit_name} (${l.orbit_abbrev ?? "—"})` : undefined,
    pad_name: l.pad_name,
    location: l.location_name
      ? `${l.location_name}${l.location_country ? ` · ${l.location_country}` : ""}`
      : undefined,
    ...(agencies ? { agencies } : {}),
  };
}

export function OpsSpaceNewsPanel({
  news,
  launches,
  health,
}: {
  news: SpaceNewsItem[];
  launches: SpaceLaunchItem[];
  health: FeedHealth;
}) {
  const [tab, setTab] = useState<"launches" | "news">("launches");
  const selectItem = useOpsStore((s) => s.selectItem);
  const selectedId = useOpsStore((s) => s.selectedItem?.id ?? null);

  return (
    <Panel title="SPACE NEWS" status={health} className="lg:col-span-1">
      <div className="flex border-b border-[var(--color-grid)]">
        {(["launches", "news"] as const).map((t) => (
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
            {t === "launches" ? "Upcoming launches" : "Defense space news"}
          </button>
        ))}
      </div>

      {tab === "news" ? (
        <ul className="max-h-72 divide-y divide-[var(--color-grid)] overflow-y-auto">
          {news.map((n, i) => (
            <li key={`${n.link}-${i}`} className="px-3 py-2 hover:bg-[rgba(0,209,255,0.05)]">
              {n.link ? (
                <a href={n.link} target="_blank" rel="noopener noreferrer" className="block">
                  <p className="line-clamp-2 font-mono text-[11px] text-[var(--color-on-surface)]">{n.title}</p>
                  {n.date && (
                    <span className="label-caps text-[10px] text-[var(--color-outline)]">{n.date}</span>
                  )}
                </a>
              ) : (
                <p className="font-mono text-[11px]">{n.title}</p>
              )}
            </li>
          ))}
          {!news.length && <Empty label="Loading space news…" />}
        </ul>
      ) : (
        <ul className="max-h-72 divide-y divide-[var(--color-grid)] overflow-y-auto">
          {launches.map((l) => (
            <li
              key={l.id}
              className={`px-3 py-2 hover:bg-[rgba(0,209,255,0.05)] ${
                selectedId === l.id ? "bg-[rgba(255,199,0,0.08)]" : ""
              }`}
              onClick={() =>
                selectItem({
                  source: "space-launch",
                  id: l.id,
                  title: l.name,
                  lat: l.pad_lat,
                  lon: l.pad_lon,
                  props: launchProps(l),
                })
              }
            >
              <div className="font-mono text-[11px] text-[var(--color-on-surface)]">{l.name}</div>
              <div className="label-caps text-[10px] text-[var(--color-outline)]">
                {l.window_start?.slice(0, 16) ?? l.last_updated?.slice(0, 16) ?? "—"}
                {l.provider ? ` · ${l.provider}` : ""}
              </div>
            </li>
          ))}
          {!launches.length && <Empty label="Loading upcoming launches…" />}
        </ul>
      )}
    </Panel>
  );
}
