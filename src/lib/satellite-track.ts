import * as satellite from "satellite.js";

export type LonLat = [number, number];
/** Longitude, latitude, height in meters above the WGS84 ellipsoid. */
export type LonLatAlt = [number, number, number];

export interface OrbitGroundTrackOptions {
  /** Reference epoch (ms). Defaults to now. */
  timestamp?: number;
  /** Samples across one full orbital period (matches space-tracker default). */
  points?: number;
}

export interface OrbitGroundTrack {
  /** Antimeridian-safe segments for the past half-orbit. */
  past: LonLatAlt[][];
  /** Antimeridian-safe segments for the future half-orbit. */
  future: LonLatAlt[][];
  /** Orbital period in minutes (derived from TLE mean motion). */
  periodMinutes: number;
}

/**
 * One-orbit ground track centered on `timestamp`, matching freezer/space-tracker:
 * half a period behind + half a period ahead (~45 min each way for typical LEO).
 */
export function computeOrbitGroundTrack(
  line1: string,
  line2: string,
  opts: OrbitGroundTrackOptions = {},
): OrbitGroundTrack | null {
  const timestamp = opts.timestamp ?? Date.now();
  const numPoints = opts.points ?? 180;

  let rec: satellite.SatRec;
  try {
    rec = satellite.twoline2satrec(line1, line2);
  } catch {
    return null;
  }

  // Mean motion → orbital period (same formula as space-tracker worker).
  const revPerDay = (rec.no * 1440) / (2 * Math.PI);
  if (!revPerDay || !Number.isFinite(revPerDay)) return null;

  const periodMs = (86400 / revPerDay) * 1000;
  const halfPeriod = periodMs / 2;
  const step = periodMs / numPoints;
  const periodMinutes = periodMs / 60_000;

  const past: LonLatAlt[] = [];
  const future: LonLatAlt[] = [];

  for (let t = timestamp - halfPeriod; t <= timestamp + halfPeriod; t += step) {
    const when = new Date(t);
    const gmst = satellite.gstime(when);
    const pv = satellite.propagate(rec, when);
    const pos = pv?.position;
    if (!pos || typeof pos === "boolean") continue;
    const geo = satellite.eciToGeodetic(pos, gmst);
    const lat = satellite.degreesLat(geo.latitude);
    const lon = satellite.degreesLong(geo.longitude);
    const heightM = geo.height * 1000;
    if (Number.isNaN(lat) || Number.isNaN(lon) || !Number.isFinite(heightM)) continue;
    const coord: LonLatAlt = [lon, lat, heightM];
    if (t <= timestamp) past.push(coord);
    else future.push(coord);
  }

  return {
    past: splitAtAntimeridian(past),
    future: splitAtAntimeridian(future),
    periodMinutes,
  };
}

function splitAtAntimeridian(points: LonLatAlt[]): LonLatAlt[][] {
  if (points.length < 2) return points.length ? [points] : [];

  const segments: LonLatAlt[][] = [];
  let current: LonLatAlt[] = [points[0]!];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    if (Math.abs(cur[0] - prev[0]) > 180) {
      if (current.length >= 2) segments.push(current);
      current = [cur];
    } else {
      current.push(cur);
    }
  }

  if (current.length >= 2) segments.push(current);
  return segments;
}

/** Flat map: ground track (2D). Globe: orbital path at satellite altitude (3D). */
export function orbitTrackPathsForProjection(
  segments: LonLatAlt[][],
  isGlobe: boolean,
): [number, number][][] | [number, number, number][][] {
  if (isGlobe) return segments;
  return segments.map((seg) => seg.map(([lon, lat]) => [lon, lat] as [number, number]));
}
