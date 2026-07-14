"use client";

import { useState } from "react";
import { LAYERS_BY_ID } from "@/config/layer-registry";
import { useStore } from "@/core/state/store";
import { Stat, TacticalButton } from "@/components/ui/primitives";
import { useIsNarrow } from "@/hooks/useMobileLayout";
import { LocationLinks } from "@/components/panels/LocationLinks";
import { SatelliteInset } from "@/components/ui/SatelliteInset";
import { AirportWeather } from "@/components/panels/AirportWeather";
import { FlightIntel } from "@/components/panels/FlightIntel";
import { VesselIntel } from "@/components/panels/VesselIntel";
import type { GeoEntity } from "@/core/types";

const TIER_LABEL: Record<string, { text: string; color: string }> = {
  confirmed: { text: "OSINT CONFIRMED", color: "var(--color-friendly)" },
  estimated: { text: "ESTIMATED", color: "var(--color-gold)" },
  baseline: { text: "BASELINE", color: "var(--color-outline)" },
};

const TEMPORAL_KEY = /(^|_)(time|date|created|updated|start|end|acq)/i;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T/;

function fmtDate(ms: number): string {
  return (
    new Date(ms).toLocaleString("en-GB", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }) + " UTC"
  );
}

/** Format a single attribute value, decoding epoch/ISO timestamps to UTC. */
function fmtValue(key: string, v: unknown): string {
  if (v == null || v === "") return "—";
  // Epoch milliseconds (e.g. USGS earthquake `time`) — only treat large numbers
  // on temporal-looking keys as dates so plain years ("2023") stay intact.
  if (typeof v === "number") {
    if (TEMPORAL_KEY.test(key) && v > 1e11) return fmtDate(v);
    return Number.isInteger(v) ? v.toString() : v.toFixed(4);
  }
  if (typeof v === "string" && ISO_DATETIME.test(v)) {
    const ms = Date.parse(v);
    if (!Number.isNaN(ms)) return fmtDate(ms);
  }
  return String(v);
}

/** Map links / readouts use source coords when a marker was ring-jittered for visibility. */
/** Internal map/build fields — hidden from the detail panel attribute list. */
const HIDDEN_ATTR_KEYS = new Set([
  "source_longitude",
  "source_latitude",
  "jittered",
  "cluster_size",
  "overlap_group_size",
  "location_tier",
]);

function displayCoords(entity: GeoEntity): { lat: number; lon: number; jittered: boolean } {
  const p = entity.properties;
  if (
    p.jittered &&
    typeof p.source_latitude === "number" &&
    typeof p.source_longitude === "number"
  ) {
    return {
      lat: p.source_latitude as number,
      lon: p.source_longitude as number,
      jittered: true,
    };
  }
  return { lat: entity.lat, lon: entity.lon, jittered: false };
}

/**
 * Attribute row. Long values truncate by default but expand on click (and show
 * a native tooltip), so the user can always read the full text. URL values
 * render as links that open in a new tab.
 */
function AttrRow({ name, text }: { name: string; text: string }) {
  const [open, setOpen] = useState(false);
  const label = name.replace(/_/g, " ");
  const isUrl = /^https?:\/\//.test(text);
  const expandable = !isUrl && text.length > 22;
  return (
    <div className="flex justify-between gap-2 px-2 py-1">
      <dt className="label-caps shrink-0 max-w-[40%] truncate" title={label}>
        {label}
      </dt>
      {isUrl ? (
        <a
          href={text}
          target="_blank"
          rel="noreferrer"
          title={text}
          className="code-data min-w-0 flex-1 truncate text-right text-[var(--color-intel)] underline-offset-2 hover:underline"
        >
          {text}
        </a>
      ) : (
        <dd
          title={expandable && !open ? text : undefined}
          onClick={expandable ? () => setOpen((o) => !o) : undefined}
          className={`code-data min-w-0 flex-1 text-right text-[var(--color-on-surface)] ${
            open ? "whitespace-normal break-words" : "truncate"
          } ${expandable ? "hover:text-[var(--color-intel)]" : ""}`}
        >
          {text}
        </dd>
      )}
    </div>
  );
}

export function RightPanel() {
  const selected = useStore((s) => s.selected);
  const rightOpen = useStore((s) => s.rightOpen);
  const select = useStore((s) => s.select);
  const setRightOpen = useStore((s) => s.setRightOpen);
  const narrow = useIsNarrow();

  if (!rightOpen || !selected) return null;

  const layer = LAYERS_BY_ID[selected.layerId];
  const tier = selected.sourceTier ? TIER_LABEL[selected.sourceTier] : null;
  const entries = Object.entries(selected.properties)
    .filter(([k, v]) => v != null && v !== "" && !HIDDEN_ATTR_KEYS.has(k))
    .slice(0, 14);

  const icao =
    (selected.properties.icao_code as string | undefined)?.trim() ||
    (selected.properties.ident as string | undefined)?.trim();
  const showWeather =
    selected.layerId === "military-airports" &&
    icao &&
    /^[A-Za-z0-9]{3,4}$/.test(icao);
  const flightHex = selected.properties.hex as string | undefined;
  const showFlightIntel = selected.layerId === "military-flights" && !!flightHex;
  const vesselMmsi = selected.properties.mmsi as string | undefined;
  const showVesselIntel = selected.layerId === "maritime-ais" && !!vesselMmsi;
  const coords = displayCoords(selected);

  const footerLinks = !layer?.approxLocation ? (
    <LocationLinks lat={coords.lat} lon={coords.lon} />
  ) : null;

  const footerAttribution = layer?.source.attribution ? (
    <div className="label-caps mt-2 text-[var(--color-outline)]">
      SRC: {layer.source.attribution}
    </div>
  ) : null;

  const panelBody = (
    <>
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

      {!layer?.approxLocation && (
        <SatelliteInset lat={coords.lat} lon={coords.lon} />
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {!layer?.approxLocation && (
          <Stat
            label={
              coords.jittered
                ? selected.properties.location_tier === "exact_colocation"
                  ? "Source location (exact)"
                  : "Source location"
                : "Coordinates"
            }
            value={
              <span className="code-data">
                {coords.lat.toFixed(4)}
                <br />
                {coords.lon.toFixed(4)}
              </span>
            }
          />
        )}
        <Stat
          label="Classification"
          value={<span className="text-xs">{layer?.name ?? selected.layerId}</span>}
          accent={layer?.color}
        />
      </div>

      {!showFlightIntel && (
        <div className="mt-3 border border-[var(--color-outline-variant)]">
          <div className="label-caps border-b border-[var(--color-outline-variant)] px-2 py-1">
            ATTRIBUTES
          </div>
          <dl className="divide-y divide-[var(--color-grid)]">
            {entries.map(([k, v]) => (
              <AttrRow key={k} name={k} text={fmtValue(k, v)} />
            ))}
          </dl>
        </div>
      )}

      {layer && (
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-on-surface-variant)]">
          {layer.description}
        </p>
      )}

      {showWeather && (
        <AirportWeather
          icao={icao.toUpperCase()}
          lon={selected.lon}
          lat={selected.lat}
          country={(selected.properties.iso_country as string | undefined)?.trim()}
        />
      )}
      {showFlightIntel && flightHex && (
        <FlightIntel hex={flightHex} properties={selected.properties} />
      )}
      {showVesselIntel && vesselMmsi && (
        <VesselIntel mmsi={String(vesselMmsi)} properties={selected.properties} />
      )}
    </>
  );

  return (
    <aside
      aria-label="Entity intelligence"
      className={
        narrow
          ? "pan-glass absolute inset-0 z-50 flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden border-l border-[var(--color-outline-variant)]"
          : "pan-glass absolute inset-y-0 right-0 z-30 flex min-h-0 w-[340px] max-w-[88vw] shrink-0 flex-col overflow-hidden border-l border-[var(--color-outline-variant)] md:relative md:z-auto"
      }
    >
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-outline-variant)] px-3 py-2">
        <span className="label-caps text-[var(--color-outline)]">
          TARGET PROFILE // {selected.id.slice(0, 12)}
        </span>
        <button
          type="button"
          onClick={() => (narrow ? setRightOpen(false) : select(null))}
          className="font-mono text-xs text-[var(--color-outline)] hover:text-[var(--color-alert)]"
        >
          ✕
        </button>
      </header>

      {narrow ? (
        <div className="pan-scroll-y min-h-0 flex-1">
          <div className="p-3">{panelBody}</div>
          {(footerLinks || footerAttribution) && (
            <footer className="shrink-0 border-t border-[var(--color-outline-variant)] p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footerLinks}
              {footerAttribution}
            </footer>
          )}
        </div>
      ) : (
        <>
          <div className="pan-scroll-y min-h-0 flex-1 p-3">{panelBody}</div>
          {(footerLinks || footerAttribution) && (
            <footer className="shrink-0 border-t border-[var(--color-outline-variant)] p-2">
              {footerLinks}
              {footerAttribution}
            </footer>
          )}
        </>
      )}
    </aside>
  );
}
