const DEG = Math.PI / 180;

function unitFromLngLat(lon: number, lat: number): [number, number, number] {
  const cosLat = Math.cos(lat * DEG);
  return [cosLat * Math.cos(lon * DEG), cosLat * Math.sin(lon * DEG), Math.sin(lat * DEG)];
}

/**
 * True when a point lies on the hemisphere facing the current view center.
 * Used with IconLayer depthCompare:always so far-side markers do not bleed through.
 */
export function isGlobePointVisible(
  lon: number,
  lat: number,
  centerLon: number,
  centerLat: number,
  margin = -0.02,
): boolean {
  const p = unitFromLngLat(lon, lat);
  const c = unitFromLngLat(centerLon, centerLat);
  return p[0] * c[0] + p[1] * c[1] + p[2] * c[2] > margin;
}
