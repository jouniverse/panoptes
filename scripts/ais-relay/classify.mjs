import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * @typedef {"military" | "cargo" | "tanker"} AisCategory
 * @typedef {{
 *   mmsi: string;
 *   name?: string;
 *   label?: string;
 *   country?: string;
 *   category?: string;
 *   source?: string;
 * }} WatchlistEntry
 */

/**
 * @param {string} repoRoot
 */
export function loadClassifiers(repoRoot) {
  const militaryPath = path.join(
    repoRoot,
    "static-data/military-vessels/military-vessels-watchlist.json",
  );
  const cargoPath = path.join(
    repoRoot,
    "static-data/military-vessels/cargo-tanker-watchlist.json",
  );

  /** @type {WatchlistEntry[]} */
  const militaryList = JSON.parse(readFileSync(militaryPath, "utf8"));
  /** @type {WatchlistEntry[]} */
  const cargoList = JSON.parse(readFileSync(cargoPath, "utf8"));

  const militarySet = new Set(militaryList.map((v) => String(v.mmsi)));
  /** @type {Map<string, WatchlistEntry>} */
  const militaryMeta = new Map(militaryList.map((v) => [String(v.mmsi), v]));
  /** @type {Map<string, WatchlistEntry>} */
  const cargoTankerMeta = new Map(cargoList.map((v) => [String(v.mmsi), v]));

  console.log(
    `[classify] military=${militarySet.size} cargo/tanker meta=${cargoTankerMeta.size}`,
  );

  return { militarySet, militaryMeta, cargoTankerMeta };
}

/**
 * Classify a normalized vessel update. Returns null if the vessel should be dropped.
 * @param {Record<string, unknown>} vessel
 * @param {ReturnType<typeof loadClassifiers>} classifiers
 */
export function classifyVessel(vessel, classifiers) {
  const mmsi = String(vessel.mmsi ?? "");
  if (!mmsi) return null;

  const shipType = typeof vessel.shipType === "number" ? vessel.shipType : 0;
  const { militarySet, militaryMeta, cargoTankerMeta } = classifiers;

  /** @type {AisCategory | null} */
  let aisCategory = null;

  if (militarySet.has(mmsi) || shipType === 35) {
    aisCategory = "military";
  } else if (shipType >= 70 && shipType <= 79) {
    aisCategory = "cargo";
  } else if (shipType >= 80 && shipType <= 89) {
    aisCategory = "tanker";
  } else {
    const meta = cargoTankerMeta.get(mmsi);
    if (meta?.label === "cargo" || meta?.label === "tanker") {
      aisCategory = meta.label;
    }
  }

  if (!aisCategory) return null;

  const meta =
    aisCategory === "military" ? militaryMeta.get(mmsi) : cargoTankerMeta.get(mmsi);

  return {
    ...vessel,
    aisCategory,
    watchlistName: meta?.name,
    watchlistCountry: meta?.country,
    watchlistLabel: meta?.label,
    watchlistCategory: meta?.category,
  };
}
