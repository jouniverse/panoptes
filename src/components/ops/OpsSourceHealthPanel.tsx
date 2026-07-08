"use client";

import { Panel, StatusLight } from "@/components/ui/primitives";
import type { FeedHealth } from "@/core/types";

export interface OpsSourceRow {
  name: string;
  health: FeedHealth;
  count: number;
}

export function OpsSourceHealthPanel({ sources }: { sources: OpsSourceRow[] }) {
  return (
    <Panel title="SOURCE HEALTH" className="lg:col-span-1">
      <ul className="max-h-72 divide-y divide-[var(--color-grid)] overflow-y-auto">
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
  );
}
