import { readFileSync } from "node:fs";
import path from "node:path";

export type AisCategory = "military" | "cargo" | "tanker";

interface WatchlistEntry {
  mmsi: string;
  name?: string;
  label?: string;
  country?: string;
  category?: string;
}

export interface ClassifiedVessel {
  mmsi: string;
  lat: number;
  lon: number;
  sog?: number;
  cog?: number;
  trueHeading?: number;
  name?: string;
  shipType?: number;
  aisCategory: AisCategory;
  watchlistName?: string;
  watchlistCountry?: string;
}

let cached: {
  militarySet: Set<string>;
  militaryMeta: Map<string, WatchlistEntry>;
  cargoTankerMeta: Map<string, WatchlistEntry>;
} | null = null;

function loadClassifiers() {
  if (cached) return cached;
  const root = process.cwd();
  const military = JSON.parse(
    readFileSync(
      path.join(root, "static-data/military-vessels/military-vessels-watchlist.json"),
      "utf8",
    ),
  ) as WatchlistEntry[];
  const cargo = JSON.parse(
    readFileSync(
      path.join(root, "static-data/military-vessels/cargo-tanker-watchlist.json"),
      "utf8",
    ),
  ) as WatchlistEntry[];

  cached = {
    militarySet: new Set(military.map((v) => String(v.mmsi))),
    militaryMeta: new Map(military.map((v) => [String(v.mmsi), v])),
    cargoTankerMeta: new Map(cargo.map((v) => [String(v.mmsi), v])),
  };
  return cached;
}

export function classifyVesselUpdate(
  vessel: Record<string, unknown>,
): ClassifiedVessel | null {
  const mmsi = String(vessel.mmsi ?? "");
  if (!mmsi) return null;
  const lat = typeof vessel.lat === "number" ? vessel.lat : null;
  const lon = typeof vessel.lon === "number" ? vessel.lon : null;
  if (lat == null || lon == null) return null;

  const shipType = typeof vessel.shipType === "number" ? vessel.shipType : 0;
  const { militarySet, militaryMeta, cargoTankerMeta } = loadClassifiers();

  let aisCategory: AisCategory | null = null;
  if (militarySet.has(mmsi) || shipType === 35) {
    aisCategory = "military";
  } else if (shipType >= 70 && shipType <= 79) {
    aisCategory = "cargo";
  } else if (shipType >= 80 && shipType <= 89) {
    aisCategory = "tanker";
  } else {
    const meta = cargoTankerMeta.get(mmsi);
    if (meta?.label === "cargo" || meta?.label === "tanker") aisCategory = meta.label;
  }
  if (!aisCategory) return null;

  const meta =
    aisCategory === "military" ? militaryMeta.get(mmsi) : cargoTankerMeta.get(mmsi);

  return {
    mmsi,
    lat,
    lon,
    sog: typeof vessel.sog === "number" ? vessel.sog : undefined,
    cog: typeof vessel.cog === "number" ? vessel.cog : undefined,
    trueHeading: typeof vessel.trueHeading === "number" ? vessel.trueHeading : undefined,
    name: typeof vessel.name === "string" ? vessel.name : meta?.name,
    shipType: shipType || undefined,
    aisCategory,
    watchlistName: meta?.name,
    watchlistCountry: meta?.country,
  };
}
