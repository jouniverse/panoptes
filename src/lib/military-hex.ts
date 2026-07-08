import registry from "@/data/military-aircraft-registry.json";

/** Compact entry built from static-data/aircraft/military-aircraft.json */
export interface MilitaryRegistryEntry {
  c?: string; // country
  o?: string; // operator (IntelSky-preferred at build time)
  w?: string; // owner
  r?: string; // registration
  t?: string; // typecode
  m?: string; // military_reason
  s?: string; // match_status
  n?: number; // source_count
  d?: string; // intelsky_description (truncated)
}

export type MilitaryMatch = {
  operator: string;
  country: string;
  owner?: string;
  registration?: string;
  type?: string;
  reason?: string;
  description?: string;
  matchStatus?: string;
  sourceCount?: number;
};

const REGISTRY = registry as Record<string, MilitaryRegistryEntry>;
const HEX_SET = new Set(Object.keys(REGISTRY));

function normHex(icao24: string): string {
  return icao24.toLowerCase().trim().padStart(6, "0").slice(-6);
}

/** True when icao24 is in the curated military aircraft registry. */
export function isMilitaryHex(icao24: string): boolean {
  return HEX_SET.has(normHex(icao24));
}

/** Lookup curated metadata for a known military aircraft hex. */
export function lookupMilitary(icao24: string): MilitaryMatch | null {
  const entry = REGISTRY[normHex(icao24)];
  if (!entry) return null;
  const operator = entry.o || entry.w || "military";
  const country = entry.c || "Unknown";
  return {
    operator,
    country,
    owner: entry.w,
    registration: entry.r,
    type: entry.t,
    reason: entry.m,
    description: entry.d,
    matchStatus: entry.s,
    sourceCount: entry.n,
  };
}

export function registrySize(): number {
  return HEX_SET.size;
}
