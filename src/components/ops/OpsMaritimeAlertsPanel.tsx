"use client";

import { useMemo, useState } from "react";
import type { Feature } from "geojson";
import { Panel } from "@/components/ui/primitives";
import { useOpsStore } from "@/core/state/ops-store";
import type { FeedHealth } from "@/core/types";
import { Empty, featureCoords } from "./ops-utils";

const AREA_ORDER = ["ALL", "NAVAREA IV", "NAVAREA XII", "HYDROLANT", "HYDROPAC", "HYDROARC"];

export function OpsMaritimeAlertsPanel({
  features,
  health,
}: {
  features: Feature[];
  health: FeedHealth;
}) {
  const selectItem = useOpsStore((s) => s.selectItem);
  const selectedId = useOpsStore((s) => s.selectedItem?.id ?? null);
  const [areaFilter, setAreaFilter] = useState("ALL");

  const areas = useMemo(() => {
    const set = new Set(features.map((f) => String((f.properties as Record<string, unknown>)?.nav_area ?? "")));
    return AREA_ORDER.filter((a) => a === "ALL" || set.has(a));
  }, [features]);

  const sorted = useMemo(
    () =>
      [...features].sort((a, b) => {
        const ta = Number((a.properties as Record<string, unknown>)?.time ?? 0);
        const tb = Number((b.properties as Record<string, unknown>)?.time ?? 0);
        return tb - ta;
      }),
    [features],
  );

  const filtered =
    areaFilter === "ALL"
      ? sorted
      : sorted.filter((f) => (f.properties as Record<string, unknown>)?.nav_area === areaFilter);

  return (
    <Panel title="MARITIME ALERTS // NGA MSI" status={health} className="lg:col-span-1">
      <div className="flex flex-wrap gap-1 border-b border-[var(--color-grid)] px-2 py-1.5">
        {areas.map((a) => (
          <button
            key={a}
            type="button"
            className={`label-caps px-2 py-0.5 text-[9px] ${
              areaFilter === a
                ? "bg-[rgba(0,209,255,0.12)] text-[var(--color-intel)]"
                : "text-[var(--color-outline)] hover:text-[var(--color-on-surface-variant)]"
            }`}
            onClick={() => setAreaFilter(a)}
          >
            {a}
          </button>
        ))}
      </div>
      <ul className="max-h-64 divide-y divide-[var(--color-grid)] overflow-y-auto">
        {filtered.map((f, i) => {
          const p = (f.properties ?? {}) as Record<string, unknown>;
          const id = String(f.id ?? i);
          const coords = featureCoords(f);
          return (
            <li
              key={id}
              className={`px-3 py-2 hover:bg-[rgba(0,209,255,0.05)] ${
                selectedId === id ? "bg-[rgba(255,199,0,0.08)]" : ""
              }`}
              onClick={() =>
                selectItem({
                  source: "maritime-alert",
                  id,
                  title: String(p.label ?? p.nav_area ?? "Alert"),
                  lat: coords?.lat,
                  lon: coords?.lon,
                  props: p,
                })
              }
            >
              <div className="flex items-center gap-2">
                <span className="label-caps text-[var(--color-gold)]">
                  {String(p.nav_area ?? "—")}
                </span>
                <span className="label-caps text-[var(--color-outline)]">
                  {String(p.label ?? "")}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 font-mono text-[11px] text-[var(--color-on-surface-variant)]">
                {String(p.text ?? p.region ?? "")}
              </p>
            </li>
          );
        })}
        {!filtered.length && <Empty label="No active warnings" />}
      </ul>
    </Panel>
  );
}
