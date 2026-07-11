"use client";

import { LAYERS_BY_ID } from "@/config/layer-registry";
import { TOOLS_LAYER_IDS } from "@/config/tools-layers";
import { useStore } from "@/core/state/store";

export function ToolsLayerPanel() {
  const toolsEnabled = useStore((s) => s.toolsEnabled);
  const toggleToolsLayer = useStore((s) => s.toggleToolsLayer);

  return (
    <div className="border-t border-[var(--color-outline-variant)] p-3">
      <div className="label-caps mb-2 text-[var(--color-outline)]">DATA LAYERS</div>
      <ul className="space-y-0.5">
        {TOOLS_LAYER_IDS.map((id) => {
          const layer = LAYERS_BY_ID[id];
          if (!layer) return null;
          const on = !!toolsEnabled[id];
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => toggleToolsLayer(id)}
                className="flex w-full items-center gap-2 px-1 py-1.5 text-left hover:bg-[rgba(0,209,255,0.04)]"
              >
                <span
                  className="h-3 w-3 shrink-0 border"
                  style={{
                    background: on ? layer.color : "transparent",
                    borderColor: on ? layer.color : "var(--color-outline-variant)",
                  }}
                />
                <span
                  className={`font-mono text-[10px] uppercase tracking-[0.06em] ${
                    on ? "text-[var(--color-on-surface)]" : "text-[var(--color-outline)]"
                  }`}
                >
                  {layer.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
