import { NextResponse } from "next/server";
import type { Feature, FeatureCollection } from "geojson";
import { cacheGet, cacheSet } from "./cache";
import { canRequest, recordFailure, recordSuccess } from "./circuit";
import type { FeedHealth } from "@/core/types";

export interface GeoProvider {
  /** cache + circuit-breaker key */
  key: string;
  /** fresh window in ms */
  ttlMs: number;
  /** serve-stale-on-error window (default 6h) */
  staleMs?: number;
  /** load + normalize upstream into GeoJSON features; throws on failure */
  load: () => Promise<Feature[]>;
}

/**
 * Wraps a provider with caching, a circuit breaker, and serve-stale-on-error.
 * Always returns a 200 FeatureCollection so the client never breaks; the real
 * status is communicated via the X-Panoptes-Health header (live/degraded/
 * stale/offline) which the UI surfaces as per-feed freshness.
 */
export async function serveGeo(p: GeoProvider): Promise<Response> {
  const cached = cacheGet<Feature[]>(p.key);

  if (cached && cached.age < p.ttlMs) {
    return geoResponse(cached.data, "live", cached.age);
  }

  if (!canRequest(p.key)) {
    if (cached) return geoResponse(cached.data, "degraded", cached.age);
    return geoResponse([], "offline", 0);
  }

  try {
    const features = await p.load();
    cacheSet(p.key, features);
    recordSuccess(p.key);
    return geoResponse(features, "live", 0);
  } catch (e) {
    recordFailure(p.key);
    const staleMs = p.staleMs ?? 6 * 3_600_000;
    if (cached && cached.age < staleMs) {
      return geoResponse(cached.data, "degraded", cached.age, e);
    }
    return geoResponse([], "stale", cached?.age ?? 0, e);
  }
}

function geoResponse(
  features: Feature[],
  health: FeedHealth,
  ageMs: number,
  error?: unknown,
): Response {
  const fc: FeatureCollection = { type: "FeatureCollection", features };
  const headers: Record<string, string> = {
    "X-Panoptes-Health": health,
    "X-Panoptes-Age": String(Math.round(ageMs / 1000)),
    "Cache-Control": "public, max-age=30, stale-while-revalidate=300",
  };
  if (error) headers["X-Panoptes-Error"] = String(error).slice(0, 140);
  return NextResponse.json(fc, { headers });
}

/** Convenience point-feature builder used by route normalizers. */
export function feature(
  lon: number,
  lat: number,
  properties: Record<string, unknown>,
  id?: string | number,
): Feature {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties,
  };
}
