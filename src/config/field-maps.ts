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
  "military-bases": { label: ["name", "label"], tier: confirmed },
  "launch-sites": { label: ["Location", "label", "name"], tier: confirmed },
  "major-ports": { label: ["PORT_NAME", "label"], tier: confirmed },
  "submarine-cables": { label: ["name", "label"], tier: confirmed },
  "data-centers": { label: ["name", "company", "label"] },
  dams: { label: ["DAM_NAME", "RES_NAME", "label"], tier: confirmed },
  "mineral-deposits": { label: ["DEPOSIT_NAME", "label"] },
  "undiscovered-oil-gas": { label: ["AU_NAME", "label"] },
  "water-conflicts": {
    label: ["Title", "label"],
    tier: confirmed,
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
};

export function fieldMapFor(layerId: string): EntityFieldMap {
  return FIELD_MAPS[layerId] ?? DEFAULT;
}
