"use client";

import { useMemo } from "react";
import { Panel } from "@/components/ui/primitives";
import { useOpsStore } from "@/core/state/ops-store";
import type { FeedHealth } from "@/core/types";
import type { SatPos } from "@/hooks/useSatellites";
import satMeta from "@/data/military-satellites-meta.json";
import { Empty } from "./ops-utils";

type SatMeta = Record<
  string,
  { country?: string; operator?: string; purpose?: string; orbit?: string; users?: string }
>;

const META = satMeta as SatMeta;

export function OpsSpaceOrbitalPanel({
  positions,
  health,
}: {
  positions: SatPos[];
  health: FeedHealth;
}) {
  const selectItem = useOpsStore((s) => s.selectItem);
  const selectedId = useOpsStore((s) => s.selectedItem?.id ?? null);

  const enriched = useMemo(
    () =>
      positions.map((p) => {
        const meta = p.norad != null ? META[String(p.norad)] : undefined;
        const name = p.name;
        const id = `sat-${p.norad ?? name.replace(/\s+/g, "_")}`;
        return { ...p, id, meta };
      }),
    [positions],
  );

  return (
    <Panel title="SPACE // ORBITAL" status={health} className="lg:col-span-1">
      <div className="px-3 py-2">
        <span className="font-mono text-2xl font-bold text-[var(--color-intel)]">
          {positions.length}
        </span>
        <span className="label-caps ml-2 text-[var(--color-outline)]">GOV / MIL OBJECTS</span>
      </div>
      <ul className="max-h-56 divide-y divide-[var(--color-grid)] overflow-y-auto">
        {enriched.slice(0, 40).map((s) => (
          <li
            key={s.id}
            className={`flex cursor-pointer items-center justify-between px-3 py-1 hover:bg-[rgba(0,209,255,0.05)] ${
              selectedId === s.id ? "bg-[rgba(255,199,0,0.08)]" : ""
            }`}
            onClick={() =>
              selectItem({
                source: "satellite",
                id: s.id,
                title: s.name,
                lat: s.lat,
                lon: s.lon,
                props: {
                  name: s.name,
                  norad: s.norad,
                  altitude_km: Math.round(s.alt),
                  country: s.meta?.country,
                  operator: s.meta?.operator,
                  purpose: s.meta?.purpose,
                  orbit: s.meta?.orbit,
                  users: s.meta?.users,
                },
              })
            }
          >
            <span className="truncate font-mono text-[11px] text-[var(--color-on-surface)]">
              {s.name}
            </span>
            <span className="code-data text-[var(--color-outline)]">
              {s.lat.toFixed(1)},{s.lon.toFixed(1)} · {s.alt.toFixed(0)}km
            </span>
          </li>
        ))}
        {!enriched.length && (
          <Empty
            label={
              health === "idle"
                ? "Loading orbital catalog…"
                : "Orbital catalog unavailable — run npm run tles:fetch"
            }
          />
        )}
      </ul>
    </Panel>
  );
}
