"use client";

import { useStore } from "@/core/state/store";
import { LAYERS_BY_ID } from "@/config/layer-registry";

export function HoverTooltip() {
  const hovered = useStore((s) => s.hovered);
  const screen = useStore((s) => s.hoverScreen);
  if (!hovered || !screen) return null;
  const layer = LAYERS_BY_ID[hovered.layerId];

  return (
    <div
      className="pointer-events-none absolute z-30 max-w-[260px]"
      style={{ left: screen.x + 14, top: screen.y + 14 }}
    >
      <div className="pan-glass pan-notch-tr border-l-2 px-2 py-1.5" style={{ borderLeftColor: layer?.color }}>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2"
            style={{ background: layer?.color }}
          />
          <span className="label-caps text-[var(--color-outline)]">
            {layer?.name ?? hovered.layerId}
          </span>
        </div>
        <div className="mt-0.5 font-mono text-xs font-bold text-[var(--color-on-surface)]">
          {hovered.label}
        </div>
        {!layer?.approxLocation && (
          <div className="code-data mt-0.5 text-[var(--color-outline)]">
            {hovered.lat.toFixed(3)}, {hovered.lon.toFixed(3)}
          </div>
        )}
      </div>
    </div>
  );
}
