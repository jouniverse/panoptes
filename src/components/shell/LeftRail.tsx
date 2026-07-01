"use client";

import { useMemo } from "react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  LAYERS,
} from "@/config/layer-registry";
import { useStore, type IntelFilter } from "@/core/state/store";
import type { FeedHealth, LayerCategory } from "@/core/types";
import { StatusLight } from "@/components/ui/primitives";

const MODE_TABS: { id: IntelFilter; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "curated", label: "STRATEGIC" },
  { id: "osint", label: "OSINT" },
];

export function LeftRail() {
  const enabled = useStore((s) => s.enabled);
  const health = useStore((s) => s.health);
  const counts = useStore((s) => s.counts);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const intelFilter = useStore((s) => s.intelFilter);
  const setIntelFilter = useStore((s) => s.setIntelFilter);
  const leftOpen = useStore((s) => s.leftOpen);
  const collapsedCats = useStore((s) => s.collapsedCats);
  const toggleCategory = useStore((s) => s.toggleCategory);

  const grouped = useMemo(() => {
    const map = new Map<LayerCategory, typeof LAYERS>();
    for (const l of LAYERS) {
      if (intelFilter !== "all" && l.mode !== intelFilter) continue;
      if (!map.has(l.category)) map.set(l.category, []);
      map.get(l.category)!.push(l);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      layers: map.get(c)!,
    }));
  }, [intelFilter]);

  if (!leftOpen) return null;

  return (
    <aside
      aria-label="Data layers"
      className="pan-glass absolute inset-y-0 left-0 z-30 flex w-[232px] max-w-[80vw] shrink-0 flex-col border-r border-[var(--color-outline-variant)] md:relative md:z-auto"
    >
      <div className="border-b border-[var(--color-outline-variant)] p-3">
        <div className="headline-sm text-[var(--color-on-surface)]">DATA LAYERS</div>
        <div className="label-caps mt-0.5 text-[var(--color-outline)]">
          OPERATIONAL_GRID_V1
        </div>
        <div className="mt-2 flex gap-1">
          {MODE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setIntelFilter(t.id)}
              className={`flex-1 border px-1 py-1 font-mono text-[9px] font-bold tracking-[0.1em] transition-colors ${
                intelFilter === t.id
                  ? "border-[var(--color-intel)] text-[var(--color-intel)]"
                  : "border-[var(--color-outline-variant)] text-[var(--color-outline)] hover:text-[var(--color-on-surface)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {grouped.map(({ category, layers }) => {
          const collapsed = !!collapsedCats[category];
          const activeCount = layers.filter((l) => enabled[l.id]).length;
          return (
          <div key={category} className="border-b border-[var(--color-grid)]">
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              aria-expanded={!collapsed}
              className="label-caps flex w-full items-center gap-1.5 bg-[rgba(0,0,0,0.3)] px-3 py-1.5 text-left text-[var(--color-intel)] transition-colors hover:bg-[rgba(0,209,255,0.08)]"
            >
              <span className="w-2 shrink-0 text-[var(--color-outline)]">
                {collapsed ? "▸" : "▾"}
              </span>
              <span className="flex-1">{CATEGORY_LABELS[category]}</span>
              {activeCount > 0 && (
                <span className="code-data text-[var(--color-friendly)]">
                  {activeCount}
                </span>
              )}
            </button>
            {!collapsed && (
            <ul>
              {layers.map((l) => {
                const on = !!enabled[l.id];
                const h: FeedHealth = health[l.id] ?? "idle";
                const count = counts[l.id];
                // Enabled but no data yet (API still fetching, e.g. the large
                // GDELT response) — show a pulsing SYNC instead of a count.
                const loading = on && count == null && h !== "offline" && h !== "stale";
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => toggleLayer(l.id)}
                      title={l.description}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[rgba(0,209,255,0.06)] ${
                        on ? "" : "opacity-50"
                      }`}
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 border"
                        style={{
                          borderColor: l.color,
                          background: on ? l.color : "transparent",
                          boxShadow: on ? `0 0 6px ${l.color}` : "none",
                        }}
                      />
                      <span className="flex-1 truncate font-mono text-[11px] tracking-[0.04em] text-[var(--color-on-surface)]">
                        {l.name}
                      </span>
                      {loading && (
                        <span className="pan-pulse code-data text-[var(--color-intel)]">
                          SYNC
                        </span>
                      )}
                      {on && !loading && count != null && (
                        <span className="code-data text-[var(--color-outline)]">
                          {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
                        </span>
                      )}
                      {on && <StatusLight state={loading ? "idle" : h} pulse={loading} />}
                    </button>
                  </li>
                );
              })}
            </ul>
            )}
          </div>
          );
        })}
      </div>
    </aside>
  );
}
