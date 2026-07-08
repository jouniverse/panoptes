import type { GeoEntity } from "@/core/types";

/** Minimum lift above the WGS84 ellipsoid (m) so icons/text clear basemap depth on the near hemisphere. */
export const GLOBE_SURFACE_LIFT_M = 12_000;

/** Layers whose markers should float at real altitude on the 3D globe (meters). */
const ALTITUDE_LAYERS = new Set(["satellites", "military-flights"]);

/** Parse entity altitude in meters for globe positioning. */
export function altitudeMeters(entity: GeoEntity): number | undefined {
  const p = entity.properties;
  if (entity.layerId === "satellites") {
    const km = p.altitude_km;
    if (typeof km === "number" && Number.isFinite(km) && km > 0) return km * 1000;
  }
  if (entity.layerId === "military-flights") {
    const alt = p.altitude;
    if (typeof alt === "number" && Number.isFinite(alt) && alt > 0) {
      // ADS-B barometric altitude is in feet.
      return alt * 0.3048;
    }
    if (typeof alt === "string") {
      const n = parseFloat(alt);
      if (Number.isFinite(n) && n > 0) return n * 0.3048;
    }
  }
  return undefined;
}

/** deck.gl position: flat map uses [lng, lat]; globe uses surface or real altitude (m). */
export function entityPosition(
  entity: GeoEntity,
  isGlobe: boolean,
): [number, number] | [number, number, number] {
  if (!isGlobe) return [entity.lon, entity.lat];
  const alt = ALTITUDE_LAYERS.has(entity.layerId) ? altitudeMeters(entity) : undefined;
  if (alt != null) return [entity.lon, entity.lat, alt];
  // Surface anchor — same as cluster ScatterplotLayer, which already works on globe.
  return [entity.lon, entity.lat];
}

/** Cluster bubbles stay on the surface; labels/icons use GLOBE_SURFACE_LIFT_M via entityPosition. */
export function lonLatPosition(
  lon: number,
  lat: number,
  isGlobe: boolean,
): [number, number] | [number, number, number] {
  if (!isGlobe) return [lon, lat];
  return [lon, lat];
}

/** Raised position for globe TextLayer labels (cluster counts). */
export function globeLabelPosition(
  lon: number,
  lat: number,
  isGlobe: boolean,
): [number, number] | [number, number, number] {
  if (!isGlobe) return [lon, lat];
  return [lon, lat, GLOBE_SURFACE_LIFT_M];
}
