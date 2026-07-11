"use client";

import { Panel } from "@/components/ui/primitives";
import { useOpsStore } from "@/core/state/ops-store";
import type { FeedHealth } from "@/core/types";
import type { Vessel } from "@/lib/vessel-store";
import { vesselListLabel } from "@/components/panels/VesselIntel";
import { FeedList } from "./ops-utils";

export function OpsMaritimeAisPanel({
  vessels,
  health,
}: {
  vessels: Vessel[];
  health: FeedHealth;
}) {
  const selectItem = useOpsStore((s) => s.selectItem);
  const selectedId = useOpsStore((s) => s.selectedItem?.id ?? null);

  const military = vessels.filter((v) => v.aisCategory === "military").length;
  const merchant = vessels.length - military;

  const rows = vessels.slice(0, 80).map((v) => ({
    id: v.mmsi,
    primary: vesselListLabel(v),
    secondary: `${v.aisCategory ?? ""} ${v.sog != null ? `${v.sog.toFixed(1)} kt` : ""}`.trim(),
    coords: v.lat != null && v.lon != null ? { lat: v.lat, lon: v.lon } : null,
    vessel: v,
  }));

  return (
    <Panel title="MARITIME // AIS" status={health} className="lg:col-span-1">
      <div className="px-3 py-2">
        <span className="font-mono text-2xl font-bold text-[var(--color-intel)]">
          {vessels.length}
        </span>
        <span className="label-caps ml-2 text-[var(--color-outline)]">VESSELS TRACKED</span>
        <div className="mt-1 font-mono text-[10px] text-[var(--color-outline)]">
          {military} military · {merchant} cargo/tanker
        </div>
      </div>
      <FeedList
        rows={rows}
        empty="No vessels — start relay (npm run ais:relay) and ensure AIS_STREAM_KEY is set"
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
          Terrestrial AIS · coastal ~200 km · relay required locally
        </div>
      </div>
    </Panel>
  );
}
