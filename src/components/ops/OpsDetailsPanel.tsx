"use client";

import { Panel } from "@/components/ui/primitives";
import { useOpsStore } from "@/core/state/ops-store";
import { Empty } from "./ops-utils";

const LABELS: Record<string, string> = {
  callsign: "Callsign",
  hex: "ICAO hex",
  operator: "Operator",
  owner: "Owner",
  operator_country: "Operator country",
  registration: "Registration",
  type: "Type",
  description: "Description",
  squawk: "Squawk",
  match_status: "Match status",
  military_reason: "Military reason",
  altitude: "Altitude",
  speed_kt: "Speed (kt)",
  heading: "Heading",
  source: "Source",
  nav_area: "NAVAREA",
  label: "Reference",
  issued: "Issued",
  region: "Region",
  text: "Text",
  country: "Country",
  purpose: "Purpose",
  orbit: "Orbit",
  norad: "NORAD ID",
  altitude_km: "Altitude (km)",
  time: "Time",
  window_start: "Window start",
  window_end: "Window end",
  last_updated: "Last updated",
  provider: "Launch provider",
  provider_type: "Provider type",
  rocket: "Rocket",
  rocket_family: "Rocket family",
  mission_name: "Mission",
  mission_type: "Mission type",
  mission_description: "Description",
  pad_name: "Launch pad",
  location: "Location",
  message_type: "Message type",
  message: "Alert text",
};

function formatPropValue(k: string, v: unknown): string {
  if (k === "text" || k === "message") return String(v);
  if (k === "time" && typeof v === "number") {
    const ms = v > 1e11 ? v : v > 1e9 ? v * 1000 : NaN;
    if (Number.isFinite(ms)) {
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        return `${d.toISOString().replace("T", " ").slice(0, 19)} UTC`;
      }
    }
  }
  const s = String(v);
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

export function OpsDetailsPanel() {
  const item = useOpsStore((s) => s.selectedItem);

  return (
    <Panel title="DETAILS" className="lg:col-span-1">
      {!item ? (
        <Empty label="Select an item from a feed panel" />
      ) : (
        <div className="max-h-[280px] overflow-y-auto p-3">
          <div className="label-caps mb-2 text-[var(--color-intel)]">
            {`${item.source.replace(/-/g, " ").toUpperCase()} · ${item.title}`}
          </div>
          {item.lat != null && item.lon != null && (
            <div className="code-data mb-2 text-[11px] text-[var(--color-gold)]">
              {item.lat.toFixed(4)}, {item.lon.toFixed(4)}
            </div>
          )}
          <dl className="divide-y divide-[var(--color-grid)] font-mono text-[11px]">
            {Object.entries(item.props)
              .filter(([, v]) => v != null && v !== "")
              .map(([k, v]) => {
                const isLong = k === "text" || k === "message";
                return (
                  <div
                    key={k}
                    className={isLong ? "py-2" : "flex justify-between gap-2 py-1"}
                  >
                    <dt className="text-[var(--color-outline)]">{LABELS[k] ?? k.replace(/_/g, " ")}</dt>
                    <dd
                      className={
                        isLong
                          ? "mt-1 whitespace-pre-wrap text-[var(--color-on-surface-variant)]"
                          : "max-w-[60%] text-right text-[var(--color-on-surface-variant)]"
                      }
                    >
                      {formatPropValue(k, v)}
                    </dd>
                  </div>
                );
              })}
          </dl>
        </div>
      )}
    </Panel>
  );
}
