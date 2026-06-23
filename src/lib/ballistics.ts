// Great-circle helpers for the missile-range tool. Re-implemented from the
// haversine / spherical-interpolation formulas (public domain); inspired by the
// MIT-licensed MISSILEMAP icbm.js approach but written from scratch.

const R_EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDeg(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Sample a great-circle path between two points (handles antimeridian via
 *  slerp). Returns [lon,lat] vertices. */
export function greatCirclePath(
  a: [number, number],
  b: [number, number],
  steps = 128,
): [number, number][] {
  const [lon1, lat1] = [toRad(a[0]), toRad(a[1])];
  const [lon2, lat2] = [toRad(b[0]), toRad(b[1])];
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );
  if (d === 0) return [a, b];
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);
    out.push([toDeg(lon), toDeg(lat)]);
  }
  return out;
}

/** A geodesic range ring (circle of given radius) around a center. */
export function rangeRing(
  center: [number, number],
  radiusKm: number,
  steps = 90,
): [number, number][] {
  const [lon0, lat0] = [toRad(center[0]), toRad(center[1])];
  const ang = radiusKm / R_EARTH_KM;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const brng = (2 * Math.PI * i) / steps;
    const lat = Math.asin(
      Math.sin(lat0) * Math.cos(ang) + Math.cos(lat0) * Math.sin(ang) * Math.cos(brng),
    );
    const lon =
      lon0 +
      Math.atan2(
        Math.sin(brng) * Math.sin(ang) * Math.cos(lat0),
        Math.cos(ang) - Math.sin(lat0) * Math.sin(lat),
      );
    ring.push([toDeg(lon), toDeg(lat)]);
  }
  return ring;
}

/** Crude minimum-energy ballistic flight time (minutes) for a given range. */
export function flightTimeMin(rangeKm: number): number {
  // Empirical fit: ~ICBM 10,000 km ≈ 30 min; scales sublinearly.
  return Math.round(33 * Math.pow(rangeKm / 10000, 0.55) * 10) / 10;
}
