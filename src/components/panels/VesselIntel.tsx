"use client";

import type { Vessel } from "@/lib/vessel-store";

const NAV_STATUS: Record<number, string> = {
  0: "Under way (engine)",
  1: "At anchor",
  2: "Not under command",
  3: "Restricted manoeuvrability",
  4: "Constrained by draught",
  5: "Moored",
  6: "Aground",
  7: "Engaged in fishing",
  8: "Under way (sailing)",
  15: "Undefined",
};

export function VesselIntel({
  mmsi,
  properties,
}: {
  mmsi: string;
  properties: Record<string, unknown>;
}) {
  const cat = String(properties.ais_category ?? "—");
  const sog = properties.sog_kt;
  const heading = properties.heading;
  const navStatus =
    typeof properties.nav_status === "number"
      ? (NAV_STATUS[properties.nav_status] ?? String(properties.nav_status))
      : "—";

  const rows: [string, string][] = [
    ["MMSI", mmsi],
    ["Category", cat],
    ["SOG (kt)", sog != null ? String(sog) : "—"],
    ["Heading", heading != null ? `${heading}°` : "—"],
    ["Nav status", navStatus],
    ["Destination", String(properties.destination ?? "—")],
    ["Ship type", properties.ship_type != null ? String(properties.ship_type) : "—"],
    ["Call sign", String(properties.call_sign ?? "—")],
    ["IMO", properties.imo != null ? String(properties.imo) : "—"],
    ["Country", String(properties.watchlist_country ?? "—")],
  ].filter(([, v]) => v !== "—") as [string, string][];

  const vfUrl = `https://www.vesselfinder.com/?mmsi=${encodeURIComponent(mmsi)}`;

  return (
    <div className="mt-3 space-y-3">
      <div className="border border-[var(--color-outline-variant)]">
        <div className="label-caps border-b border-[var(--color-outline-variant)] px-2 py-1">
          VESSEL // {mmsi}
        </div>
        <dl className="divide-y divide-[var(--color-outline-variant)]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 px-2 py-1">
              <dt className="label-caps text-[var(--color-outline)]">{k}</dt>
              <dd className="code-data text-right text-[var(--color-on-surface)]">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <a
        href={vfUrl}
        target="_blank"
        rel="noreferrer"
        className="label-caps block border border-[var(--color-outline-variant)] px-2 py-1.5 text-center text-[var(--color-intel)] hover:border-[var(--color-intel)]"
      >
        VesselFinder ↗
      </a>
    </div>
  );
}

/** Format vessel for OPS list rows. */
export function vesselListLabel(v: Vessel): string {
  return v.watchlistName || v.name || `MMSI ${v.mmsi}`;
}
