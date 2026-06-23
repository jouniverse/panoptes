"use client";

import { LAYERS_BY_ID } from "@/config/layer-registry";
import { useStore } from "@/core/state/store";
import { Stat, TacticalButton } from "@/components/ui/primitives";
import { SatelliteInset } from "@/components/ui/SatelliteInset";

const TIER_LABEL: Record<string, { text: string; color: string }> = {
  confirmed: { text: "OSINT CONFIRMED", color: "var(--color-friendly)" },
  estimated: { text: "ESTIMATED", color: "var(--color-gold)" },
  baseline: { text: "BASELINE", color: "var(--color-outline)" },
};

function fmt(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return Number.isInteger(v) ? v.toString() : v.toFixed(4);
  return String(v);
}

export function RightPanel() {
  const selected = useStore((s) => s.selected);
  const rightOpen = useStore((s) => s.rightOpen);
  const select = useStore((s) => s.select);

  if (!rightOpen || !selected) return null;

  const layer = LAYERS_BY_ID[selected.layerId];
  const tier = selected.sourceTier ? TIER_LABEL[selected.sourceTier] : null;
  const entries = Object.entries(selected.properties)
    .filter(([, v]) => v != null && v !== "")
    .slice(0, 14);

  return (
    <aside
      aria-label="Entity intelligence"
      className="pan-glass absolute inset-y-0 right-0 z-30 flex w-[340px] max-w-[88vw] shrink-0 flex-col border-l border-[var(--color-outline-variant)] md:relative md:z-auto"
    >
      <header className="flex items-center justify-between border-b border-[var(--color-outline-variant)] px-3 py-2">
        <span className="label-caps text-[var(--color-outline)]">
          TARGET PROFILE // {selected.id.slice(0, 12)}
        </span>
        <button
          type="button"
          onClick={() => select(null)}
          className="font-mono text-xs text-[var(--color-outline)] hover:text-[var(--color-alert)]"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-mono text-base font-bold leading-tight text-[var(--color-on-surface)]">
            {selected.label}
          </h2>
          {tier && (
            <span
              className="shrink-0 border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.1em]"
              style={{ borderColor: tier.color, color: tier.color }}
            >
              {tier.text}
            </span>
          )}
        </div>

        <SatelliteInset lat={selected.lat} lon={selected.lon} />

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat
            label="Coordinates"
            value={
              <span className="code-data">
                {selected.lat.toFixed(4)}
                <br />
                {selected.lon.toFixed(4)}
              </span>
            }
          />
          <Stat
            label="Classification"
            value={<span className="text-xs">{layer?.name ?? selected.layerId}</span>}
            accent={layer?.color}
          />
        </div>

        <div className="mt-3 border border-[var(--color-outline-variant)]">
          <div className="label-caps border-b border-[var(--color-outline-variant)] px-2 py-1">
            ATTRIBUTES
          </div>
          <dl className="divide-y divide-[var(--color-grid)]">
            {entries.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 px-2 py-1">
                <dt className="label-caps">{k.replace(/_/g, " ")}</dt>
                <dd className="code-data max-w-[180px] truncate text-right text-[var(--color-on-surface)]">
                  {fmt(v)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {layer && (
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-on-surface-variant)]">
            {layer.description}
          </p>
        )}
      </div>

      <footer className="border-t border-[var(--color-outline-variant)] p-2">
        <div className="flex gap-2">
          <TacticalButton
            className="flex-1"
            onClick={() =>
              window.open(
                `https://www.openstreetmap.org/?mlat=${selected.lat}&mlon=${selected.lon}#map=12/${selected.lat}/${selected.lon}`,
                "_blank",
              )
            }
          >
            OPEN OSM
          </TacticalButton>
          <TacticalButton
            className="flex-1"
            onClick={() =>
              window.open(
                `https://browser.dataspace.copernicus.eu/?zoom=12&lat=${selected.lat}&lng=${selected.lon}`,
                "_blank",
              )
            }
          >
            IMINT
          </TacticalButton>
        </div>
        {layer?.source.attribution && (
          <div className="label-caps mt-2 text-[var(--color-outline)]">
            SRC: {layer.source.attribution}
          </div>
        )}
      </footer>
    </aside>
  );
}
