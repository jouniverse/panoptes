"use client";

import type { Feature } from "geojson";
import { Panel } from "@/components/ui/primitives";
import { useOpsStore } from "@/core/state/ops-store";
import type { FeedHealth } from "@/core/types";
import { featureCoords, FeedList } from "./ops-utils";

export function OpsAviationPanel({
  features,
  health,
}: {
  features: Feature[];
  health: FeedHealth;
}) {
  const selectItem = useOpsStore((s) => s.selectItem);
  const selectedId = useOpsStore((s) => s.selectedItem?.id ?? null);

  const rows = features.slice(0, 60).map((f, i) => {
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const coords = featureCoords(f);
    const id = String(f.id ?? p.hex ?? i);
    return {
      id,
      primary: String(p.callsign ?? p.hex ?? "—"),
      secondary: `${p.type ?? ""} ${p.altitude ?? ""}`.trim(),
      feature: f,
      coords,
    };
  });

  return (
    <Panel title="AVIATION // MIL ADS-B" status={health} className="lg:col-span-1">
      <div className="px-3 py-2">
        <span className="font-mono text-2xl font-bold text-[var(--color-intel)]">
          {features.length}
        </span>
        <span className="label-caps ml-2 text-[var(--color-outline)]">MIL AIRCRAFT TRACKED</span>
      </div>
      <FeedList
        rows={rows}
        empty="No military aircraft in view"
        selectedId={selectedId}
        onSelect={(id) => {
          const row = rows.find((r) => r.id === id);
          if (!row) return;
          const p = (row.feature.properties ?? {}) as Record<string, unknown>;
          selectItem({
            source: "aviation",
            id: row.id,
            title: String(p.callsign ?? p.hex ?? row.id),
            lat: row.coords?.lat,
            lon: row.coords?.lon,
            props: p,
          });
        }}
      />
    </Panel>
  );
}
