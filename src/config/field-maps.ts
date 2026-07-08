import type { EntityFieldMap } from "@/lib/geo";
import type { SourceTier } from "@/core/types";

const DEFAULT: EntityFieldMap = {
  label: ["label", "name", "title", "NAME", "place"],
};

const confirmed = (): SourceTier => "confirmed";

/** Per-layer mapping of raw GeoJSON properties -> GeoEntity fields. */
export const FIELD_MAPS: Record<string, EntityFieldMap> = {
  "country-borders": { label: ["NAME", "ADMIN", "name"] },
  "populated-places": { label: ["NAME", "name", "nameascii"] },
  "military-bases": { label: ["name", "label", "nearest_city"], tier: confirmed },
  "launch-sites": { label: ["Location", "label", "name"], tier: confirmed },
  "major-ports": { label: ["PORT_NAME", "label"], tier: confirmed },
  "maritime-alerts": {
    label: ["label", "region"],
    tier: confirmed,
    timestamp: (p) => (typeof p.time === "number" ? p.time : undefined),
  },
  "submarine-cables": { label: ["name", "label"], tier: confirmed },
  "data-centers": { label: ["name", "company", "label"] },
  dams: { label: ["DAM_NAME", "RES_NAME", "label"], tier: confirmed },
  "critical-minerals": { label: ["DEPOSIT_NAME", "label"] },
  "mineral-deposits": { label: ["DEP_NAME", "label"] },
  "iron-ore-mines": { label: ["Asset name (English)", "label"] },
  "prio-diamonds": { label: ["NAME", "LANDMARK", "label"] },
  "prio-gems": { label: ["NAME", "GEMSTONE", "label"] },
  "undiscovered-oil-gas": { label: ["AU_NAME", "label"] },
  // §3.13
  refineries: { label: ["name", "label"] },
  "lng-terminals": { label: ["name", "label"] },
  "petroleum-terminals": { label: ["FAC_NAME", "label"] },
  "offshore-platforms": { label: ["name", "label"] },
  "og-fields": { label: ["Unit Name", "label"] },
  "gas-pipelines": { label: ["name", "PipelineName", "label"] },
  // §3.14
  railroads: { label: ["continent", "category"] },
  "water-conflicts": {
    label: ["Title", "label"],
    tier: confirmed,
  },
  "historical-conflicts": {
    label: ["location", "label"],
    tier: () => "baseline",
    timestamp: (p) => {
      if (typeof p.timestamp === "number") return p.timestamp;
      if (typeof p.year === "number") return Date.UTC(p.year, 0, 1);
      return undefined;
    },
  },
  // API layers (routes already normalize into label/severity/timestamp/tier)
  "conflict-events": {
    label: ["title", "label", "name"],
    severity: (p) => (typeof p.tone === "number" ? Math.min(1, Math.abs(p.tone) / 10) : undefined),
    tier: () => "estimated",
  },
  earthquakes: {
    label: ["label", "place", "title"],
    severity: (p) => (typeof p.mag === "number" ? Math.min(1, p.mag / 9) : undefined),
    timestamp: (p) => (typeof p.time === "number" ? p.time : undefined),
    tier: confirmed,
  },
  "earthquakes-major": {
    label: ["label", "place", "title"],
    severity: (p) => (typeof p.mag === "number" ? Math.min(1, p.mag / 9) : undefined),
    timestamp: (p) => (typeof p.time === "number" ? p.time : undefined),
    tier: confirmed,
  },
  fires: {
    label: ["label"],
    severity: (p) => (typeof p.frp === "number" ? Math.min(1, p.frp / 100) : undefined),
    timestamp: (p) => (typeof p.time === "number" ? p.time : undefined),
    tier: () => "estimated",
  },
  disasters: { label: ["name", "label", "title"], tier: confirmed },
  "military-flights": {
    label: ["callsign", "label", "registration"],
    tier: confirmed,
    timestamp: (p) => (typeof p.time === "number" ? p.time : undefined),
  },
  "internet-outages": {
    label: ["label", "name"],
    tier: () => "estimated",
    timestamp: (p) => (typeof p.time === "number" ? p.time : undefined),
  },
  // §3.7
  satellites: { label: ["name", "label"], tier: confirmed },
  // §3.2
  "military-airports": { label: ["name", "ident", "icao_code"], tier: confirmed },
  // §3.5
  rivers: { label: ["name_en", "name"] },
  // §3.6
  "tectonic-boundaries": { label: ["Name", "Type"] },
  navareas: { label: ["navarea", "coordinator"] },
  "urban-areas": { label: ["area_sqkm"] },
  volcanoes: { label: ["name", "label"], tier: confirmed },
  "og-basins": { label: ["NAME", "label"] },
  // §3.11
  "nuclear-power-plants": { label: ["Unit Name", "Project Name"], tier: confirmed },
  "power-plants": { label: ["name", "label"] },
  "iron-steel-plants": { label: ["Plant name (English)", "label"] },
  "ammonia-plants": { label: ["Plant name (English)", "label"] },
};

export function fieldMapFor(layerId: string): EntityFieldMap {
  return FIELD_MAPS[layerId] ?? DEFAULT;
}
