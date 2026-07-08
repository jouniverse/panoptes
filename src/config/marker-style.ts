import type { GeoEntity } from "@/core/types";
import { hexToRgba, PALETTE, type RGBA } from "./theme";

/**
 * Per-layer dynamic marker styling, driven by entity properties.
 *
 * `markerLayer` (useDeckLayers) calls `markerColorFor(layerId)` and, if a
 * resolver exists, uses it to colour each marker individually (e.g. age,
 * active/inactive status). Layers without a resolver keep their flat
 * `layer.color`. Selection (gold) always wins over a dynamic colour.
 */
export type MarkerColorFn = (e: GeoEntity) => RGBA;

/** Extract the most relevant year from a free-text date string.
 *  Handles "2500 BC", "2011-2012" (takes the later year), "1991". */
function parseYear(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw);
  if (/\bBC\b/i.test(s)) return -1; // ancient — always "old"
  const years = s.match(/\d{4}/g);
  if (!years || years.length === 0) return null;
  return Math.max(...years.map(Number));
}

const NOW_YEAR = new Date().getUTCFullYear();

function waterConflictColor(e: GeoEntity): RGBA {
  const year = parseYear(e.properties.Date);
  if (year == null) return hexToRgba(PALETTE.alert, 150);
  const age = NOW_YEAR - year;
  if (age > 20) return hexToRgba(PALETTE.outline, 130); // historical, muted grey
  if (age <= 5) return hexToRgba(PALETTE.alert, 255); // recent, bright red
  return hexToRgba(PALETTE.alert, 200); // within 20y, mid red
}

/** A launch site is "active" when its operational range is open-ended
 *  (e.g. "1970-", "1986-1993, 2000s-"); a closed range or lone year is past. */
function launchSiteColor(e: GeoEntity): RGBA {
  const op = String(e.properties.operational ?? "").trim();
  const active = op.endsWith("-");
  return active
    ? hexToRgba(PALETTE.intel, 255) // operational — cyan
    : hexToRgba(PALETTE.outline, 150); // decommissioned — muted grey
}

/** Closed military airfields — muted; operational bases keep layer gold. */
function militaryAirportColor(e: GeoEntity): RGBA {
  const t = String(e.properties.type ?? "").toLowerCase();
  return t === "closed"
    ? hexToRgba(PALETTE.outline, 150)
    : hexToRgba(PALETTE.gold, 235);
}

/**
 * GDELT "tone" is theoretically −100..+100, but for a news query the values
 * cluster tightly around 0 (observed for our conflict query: ~−15..+10, median
 * ≈ −1, >99% within ±10). So we band around that realistic range rather than
 * ±100 (which would paint everything "neutral"). More negative = more alarming.
 */
export interface ToneBand {
  label: string;
  /** inclusive lower bound (−Infinity for the lowest band) */
  min: number;
  color: string;
}

export const GDELT_TONE_BANDS: ToneBand[] = [
  { label: "Highly negative", min: -Infinity, color: PALETTE.alert },
  { label: "Negative", min: -5, color: PALETTE.gold },
  { label: "Neutral", min: -2, color: PALETTE.outline },
  { label: "Positive", min: 2, color: PALETTE.friendly },
];

export function toneBand(tone: number): ToneBand {
  // bands are ordered ascending by `min`; pick the highest whose min <= tone
  let band = GDELT_TONE_BANDS[0];
  for (const b of GDELT_TONE_BANDS) if (tone >= b.min) band = b;
  return band;
}

function gdeltToneColor(e: GeoEntity): RGBA {
  const tone = e.properties.tone;
  if (typeof tone !== "number") return hexToRgba(PALETTE.outline, 180);
  return hexToRgba(toneBand(tone).color, 235);
}

/** Raw tone number → RGBA (used for cluster aggregate tone coloring). */
export function toneToColor(tone: number, alpha = 235): RGBA {
  return hexToRgba(toneBand(tone).color, alpha);
}

const MS_PER_DAY = 24 * 60 * 60_000;

/**
 * NGA navigational warnings stay in force for weeks or months.
 * Color by age so recently-issued alerts stand out over old ones.
 *   < 30 days : alert red   — recent, likely still relevant
 *   30–60 days: gold        — aging
 *   > 60 days : grey        — old but still formally in force
 */
function maritimeAlertColor(e: GeoEntity): RGBA {
  const t = typeof e.timestamp === "number" ? e.timestamp : null;
  if (t == null) return hexToRgba(PALETTE.outline, 160);
  const ageDays = (Date.now() - t) / MS_PER_DAY;
  if (ageDays > 60) return hexToRgba(PALETTE.outline, 150);
  if (ageDays > 30) return hexToRgba(PALETTE.gold, 220);
  return hexToRgba(PALETTE.alert, 235);
}

/** COW MIDLOC: disputes (MIDLOCA) vs incidents (MIDLOCI). */
function historicalConflictColor(e: GeoEntity): RGBA {
  const rt = String(e.properties.record_type ?? "");
  const ds = String(e.properties.source_dataset ?? "");
  const incident = rt === "incident" || ds.includes("MIDLOCI");
  return incident
    ? hexToRgba(PALETTE.alert, 220) // violent incidents — red
    : hexToRgba(PALETTE.gold, 220); // interstate disputes — gold
}

const POWER_FUEL_COLORS: Partial<Record<string, RGBA>> = {
  Nuclear: hexToRgba("#ff4b2b", 230), // alert red
  Hydro: hexToRgba(PALETTE.intel, 210), // cyan
  Wind: hexToRgba(PALETTE.friendly, 200), // green
  Solar: hexToRgba(PALETTE.gold, 210), // gold
  Gas: hexToRgba("#ff8c00", 220), // orange
  Coal: hexToRgba("#7a7a7a", 200), // dark grey
  Oil: hexToRgba("#8b4513", 220), // brown
  Biomass: hexToRgba("#6ab04c", 200), // moss green
  Geothermal: hexToRgba("#e84393", 210), // magenta
};

function powerPlantColor(e: GeoEntity): RGBA {
  const fuel = e.properties.primary_fuel as string;
  return POWER_FUEL_COLORS[fuel] ?? hexToRgba(PALETTE.outline, 180);
}

export const MARKER_COLORS: Record<string, MarkerColorFn> = {
  "water-conflicts": waterConflictColor,
  "launch-sites": launchSiteColor,
  "military-airports": militaryAirportColor,
  "conflict-events": gdeltToneColor,
  "maritime-alerts": maritimeAlertColor,
  "power-plants": powerPlantColor,
  "historical-conflicts": historicalConflictColor,
};

export function markerColorFor(layerId: string): MarkerColorFn | undefined {
  return MARKER_COLORS[layerId];
}
