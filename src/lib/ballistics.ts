// Great-circle helpers for the missile-range tool. Re-implemented from the
// haversine / spherical-interpolation formulas (public domain); inspired by the
// MIT-licensed MISSILEMAP icbm.js approach but written from scratch.

const R_EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Half the Earth's circumference — geodesic radius above this inverts the fill. */
export const HEMISPHERE_RANGE_KM = (Math.PI * R_EARTH_KM) / 2;

/** Web Mercator practical lat clip (matches map edge, avoids pole singularities). */
const LAT_CLIP = 85;

const WORLD_OUTER: [number, number][] = [
  [-180, -LAT_CLIP],
  [180, -LAT_CLIP],
  [180, LAT_CLIP],
  [-180, LAT_CLIP],
  [-180, -LAT_CLIP],
];

export type LonLat = [number, number];
/** deck.gl polygon: [exterior, ...holes] — each ring is [lon, lat][]. */
export type RangePolygon = LonLat[][];

export function haversineKm(a: LonLat, b: LonLat): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearingDeg(a: LonLat, b: LonLat): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Sample a great-circle path between two points (handles antimeridian via slerp). */
export function greatCirclePath(a: LonLat, b: LonLat, steps = 128): LonLat[] {
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
  const out: LonLat[] = [];
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

export function antipodePoint(center: LonLat): LonLat {
  let lon = center[0] + 180;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return [lon, -center[1]];
}

/** A geodesic range ring (circle of given radius) around a center. */
export function rangeRing(center: LonLat, radiusKm: number, steps?: number): LonLat[] {
  const n = steps ?? ringSteps(radiusKm);
  const [lon0, lat0] = [toRad(center[0]), toRad(center[1])];
  const ang = radiusKm / R_EARTH_KM;
  const ring: LonLat[] = [];
  for (let i = 0; i <= n; i++) {
    const brng = (2 * Math.PI * i) / n;
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

function ringSteps(radiusKm: number): number {
  return Math.min(360, Math.max(90, Math.ceil(radiusKm / 25)));
}

function normalizeLon(lon: number): number {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

function intersectLat(a: LonLat, b: LonLat, clipLat: number): LonLat | null {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  if ((lat1 - clipLat) * (lat2 - clipLat) > 0) return null;
  if (lat1 === lat2) return null;
  const t = (clipLat - lat1) / (lat2 - lat1);
  return [normalizeLon(lon1 + t * (lon2 - lon1)), clipLat];
}

/** Clip a ring to Mercator limits and seal polar caps with a flat edge at ±LAT_CLIP. */
function clipRingToMapBounds(ring: LonLat[]): LonLat[] {
  const n = ring.length;
  if (n < 3) return ring;

  let maxLat = -90;
  let minLat = 90;
  for (const p of ring) {
    maxLat = Math.max(maxLat, p[1]);
    minLat = Math.min(minLat, p[1]);
  }

  const out: LonLat[] = [];
  const northHits: LonLat[] = [];
  const southHits: LonLat[] = [];

  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const aIn = Math.abs(a[1]) <= LAT_CLIP;
    const bIn = Math.abs(b[1]) <= LAT_CLIP;

    if (aIn) out.push(a);

    if (aIn !== bIn) {
      const clipLat =
        !bIn && b[1] > LAT_CLIP
          ? LAT_CLIP
          : !bIn && b[1] < -LAT_CLIP
            ? -LAT_CLIP
            : a[1] > LAT_CLIP
              ? LAT_CLIP
              : -LAT_CLIP;
      const hit = intersectLat(a, b, clipLat);
      if (hit) {
        out.push(hit);
        if (clipLat > 0) northHits.push(hit);
        else southHits.push(hit);
      }
    }
  }

  if (northHits.length >= 2 && maxLat > LAT_CLIP) {
    northHits.sort((p, q) => p[0] - q[0]);
    const west = northHits[0]!;
    const east = northHits[northHits.length - 1]!;
    const last = out[out.length - 1];
    if (!last || last[0] !== east[0] || last[1] !== east[1]) out.push(east);
    out.push(west);
  }

  if (southHits.length >= 2 && minLat < -LAT_CLIP) {
    southHits.sort((p, q) => p[0] - q[0]);
    const west = southHits[0]!;
    const east = southHits[southHits.length - 1]!;
    const last = out[out.length - 1];
    if (!last || last[0] !== east[0] || last[1] !== east[1]) out.push(east);
    out.push(west);
  }

  return out.length >= 3 ? out : ring;
}

function splitRingAtAntimeridian(ring: LonLat[]): LonLat[][] {
  if (ring.length < 2) return ring.length ? [ring] : [];

  const segments: LonLat[][] = [];
  let current: LonLat[] = [ring[0]!];

  for (let i = 1; i < ring.length; i++) {
    const prev = ring[i - 1]!;
    const cur = ring[i]!;
    if (Math.abs(cur[0] - prev[0]) > 180) {
      if (current.length >= 3) segments.push(current);
      current = [cur];
    } else {
      current.push(cur);
    }
  }

  if (current.length >= 3) segments.push(current);
  return segments;
}

function reverseRing(ring: LonLat[]): LonLat[] {
  return ring.slice().reverse();
}

/**
 * Geodesic range fill polygons for deck.gl PolygonLayer.
 * Handles: (1) ranges > half-Earth — world fill minus antipodal hole;
 * (2) polar Mercator clip; (3) antimeridian splits.
 */
export function rangeRingPolygons(center: LonLat, radiusKm: number): RangePolygon[] {
  const maxRange = Math.PI * R_EARTH_KM;
  if (radiusKm >= maxRange - 1) {
    return [[WORLD_OUTER]];
  }

  // Beyond ~10,007 km the naive ring encloses the antipodal cap, not the launch disk.
  if (radiusKm > HEMISPHERE_RANGE_KM) {
    const antipode = antipodePoint(center);
    const holeRadius = maxRange - radiusKm;
    if (holeRadius <= 0.01) return [[WORLD_OUTER]];
    const hole = clipRingToMapBounds(rangeRing(antipode, holeRadius));
    return [[WORLD_OUTER, reverseRing(hole)]];
  }

  const ring = clipRingToMapBounds(rangeRing(center, radiusKm));
  const segments = splitRingAtAntimeridian(ring);
  if (!segments.length) return [[ring]];
  return segments.map((seg) => [seg]);
}

/** Stroke paths for the range boundary (always centered on launch point). */
export function rangeRingStrokePaths(center: LonLat, radiusKm: number): LonLat[][] {
  const ring = rangeRing(center, radiusKm);
  const segments = splitRingAtAntimeridian(ring);
  return segments.length ? segments : [ring];
}

/** @deprecated Use rangeRingPolygons — kept for callers expecting segment lists. */
export function rangeRingSegments(center: LonLat, radiusKm: number): LonLat[][] {
  return rangeRingPolygons(center, radiusKm).map((poly) => poly[0] ?? []);
}

/** Crude minimum-energy ballistic flight time (minutes) for a given range. */
export function flightTimeMin(rangeKm: number): number {
  return Math.round(33 * Math.pow(rangeKm / 10000, 0.55) * 10) / 10;
}
