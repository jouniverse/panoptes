"use client";

import { Panel } from "@/components/ui/primitives";
import type { FeedHealth } from "@/core/types";
import { Empty } from "./ops-utils";

export interface NavalNewsItem {
  title: string;
  link: string;
  source: string;
  date?: string;
}

export function OpsNavalNewsPanel({
  items,
  health,
}: {
  items: NavalNewsItem[];
  health: FeedHealth;
}) {
  return (
    <Panel title="NAVAL NEWS" status={health} className="lg:col-span-1">
      <ul className="max-h-72 divide-y divide-[var(--color-grid)] overflow-y-auto">
        {items.slice(0, 40).map((n, i) => (
          <li key={`${n.link}-${i}`} className="px-3 py-2 hover:bg-[rgba(0,209,255,0.05)]">
            <a href={n.link} target="_blank" rel="noopener noreferrer" className="block">
              <div className="flex items-center gap-2">
                <span className="label-caps text-[var(--color-gold)]">{n.source}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 font-mono text-[11px] text-[var(--color-on-surface)]">
                {n.title}
              </p>
            </a>
          </li>
        ))}
        {!items.length && <Empty label="Loading naval feeds…" />}
      </ul>
    </Panel>
  );
}
