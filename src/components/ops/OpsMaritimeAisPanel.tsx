"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/primitives";
import { useOpsStore } from "@/core/state/ops-store";
import type { FeedHealth } from "@/core/types";
import type { Vessel } from "@/lib/vessel-store";
import { vesselListLabel } from "@/components/panels/VesselIntel";
import { FeedList } from "./ops-utils";

type AisTab = "military" | "merchant";

export function OpsMaritimeAisPanel({
  vessels,
  health,
}: {
  vessels: Vessel[];
  health: FeedHealth;
}) {
  const [tab, setTab] = useState<AisTab>("military");
  const selectItem = useOpsStore((s) => s.selectItem);
  const selectedId = useOpsStore((s) => s.selectedItem?.id ?? null);

  const militaryVessels = vessels.filter((v) => v.aisCategory === "military");
  const merchantVessels = vessels.filter(
    (v) => v.aisCategory === "cargo" || v.aisCategory === "tanker",
  );

  const activeList = tab === "military" ? militaryVessels : merchantVessels.slice(0, 200);

  const rows = activeList.map((v) => ({
    id: v.mmsi,
    primary: vesselListLabel(v),
    secondary: `${v.aisCategory ?? ""} ${v.sog != null ? `${v.sog.toFixed(1)} kt` : ""}`.trim(),
    coords: v.lat != null && v.lon != null ? { lat: v.lat, lon: v.lon } : null,
    vessel: v,
  }));

  return (
    <Panel title="MARITIME // AIS" status={health} className="lg:col-span-1">
      <div className="flex border-b border-[var(--color-grid)]">
        {(
          [
            ["military", "Military", militaryVessels.length],
            ["merchant", "Cargo & Tankers", merchantVessels.length],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`label-caps flex-1 px-2 py-1.5 text-[10px] ${
              tab === id
                ? "bg-[rgba(0,209,255,0.1)] text-[var(--color-intel)]"
                : "text-[var(--color-outline)] hover:text-[var(--color-on-surface-variant)]"
            }`}
          >
            {label} ({count})
          </button>
        ))}
      </div>

      <FeedList
        rows={rows}
        empty={
          tab === "military"
            ? "No military vessels in stream"
            : "No cargo/tanker vessels in stream"
        }
        selectedId={selectedId}
        onSelect={(id) => {
          const row = rows.find((r) => r.id === id);
          if (!row?.coords) return;
          const v = row.vessel;
          selectItem({
            source: "maritime-ais",
            id: v.mmsi,
            title: vesselListLabel(v),
            lat: row.coords.lat,
            lon: row.coords.lon,
            props: {
              mmsi: v.mmsi,
              name: v.name,
              ais_category: v.aisCategory,
              sog_kt: v.sog,
              heading: v.trueHeading ?? v.cog,
              ship_type: v.shipType,
              destination: v.destination,
              nav_status: v.navStatus,
              call_sign: v.callSign,
              imo: v.imoNumber,
              watchlist_country: v.watchlistCountry,
            },
          });
        }}
      />
      <div className="border-t border-[var(--color-outline-variant)] px-3 py-2">
        <div className="label-caps text-[var(--color-outline)]">
          Terrestrial AIS · coastal ~50 km · relay required locally
        </div>
      </div>
    </Panel>
  );
}
