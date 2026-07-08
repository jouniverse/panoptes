import { NextResponse } from "next/server";
import { fetchText } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";
import noradData from "@/data/military-norad-ids.json";
import {
  type Tle,
  type TleBundle,
  parseTle,
  readDiskTleBundle,
  writeDiskTleBundle,
  fetchGovMilitaryTles,
  bundleAgeHealth,
  TLE_TTL_LIVE_MS,
  TLE_TTL_STALE_MS,
} from "@/lib/gov-military-tle-store";
import type { FeedHealth } from "@/core/types";

/** Gov/mil TLEs: Space-Track.org (primary, via SPACETRACK_* env) + disk cache.
 *  CelesTrak is fallback only. Refresh: `npm run tles:fetch` (daily).
 *  Serves both Geospatial and OPS via useSatellites → satellite.worker. */

export const maxDuration = 60;

const GROUPS: Record<string, string> = {
  stations: "stations",
  visual: "visual",
  "gps-ops": "gps-ops",
  galileo: "galileo",
  geo: "geo",
  science: "science",
  weather: "weather",
  "gov-military": "active",
};

const UCS_NORAD_IDS = (noradData as { noradIds: number[] }).noradIds;

const CELESTRAK_HEADERS = {
  "User-Agent": "Panoptes/1.0 (milint; educational orbital tracking)",
};

const GOV_MIL_CACHE_KEY = "tle:gov-military:bundle";

function tleResponse(
  group: string,
  tles: Tle[],
  health: FeedHealth,
  ageMs = 0,
  error?: string,
): Response {
  const headers: Record<string, string> = {
    "X-Panoptes-Health": health,
    "X-Panoptes-Age": String(Math.round(ageMs / 1000)),
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  };
  if (error) headers["X-Panoptes-Error"] = error.slice(0, 140);
  return NextResponse.json({ group, tles, ...(error ? { error } : {}) }, { headers });
}

function bestCachedBundle(): { bundle: TleBundle; ageMs: number; source: "memory" | "disk" } | null {
  const mem = cacheGet<TleBundle>(GOV_MIL_CACHE_KEY);
  const disk = readDiskTleBundle();

  const candidates: { bundle: TleBundle; ageMs: number; source: "memory" | "disk" }[] = [];
  if (mem?.data?.tles?.length) {
    candidates.push({ bundle: mem.data, ageMs: mem.age, source: "memory" });
  }
  if (disk?.tles?.length) {
    candidates.push({ bundle: disk, ageMs: disk.ageMs, source: "disk" });
  }
  if (!candidates.length) return null;
  return candidates.sort((a, b) => a.ageMs - b.ageMs)[0];
}

async function handleGovMilitary(): Promise<Response> {
  const cached = bestCachedBundle();

  // Prefer persisted bundle — refresh via `npm run tles:fetch` (daily), not on each request.
  if (cached) {
    return tleResponse(
      "gov-military",
      cached.bundle.tles,
      bundleAgeHealth(cached.ageMs),
      cached.ageMs,
    );
  }

  // First run / no cache file yet — attempt live fetch and persist.
  try {
    const { tles, source } = await fetchGovMilitaryTles(UCS_NORAD_IDS);
    const bundle: TleBundle = {
      fetchedAt: new Date().toISOString(),
      count: tles.length,
      source,
      tles,
    };
    cacheSet(GOV_MIL_CACHE_KEY, bundle);
    writeDiskTleBundle(bundle);
    return tleResponse("gov-military", tles, "live", 0);
  } catch (e) {
    return tleResponse("gov-military", [], "stale", 0, String(e).slice(0, 120));
  }
}

export async function GET(req: Request) {
  const group = new URL(req.url).searchParams.get("group") || "stations";
  const slug = GROUPS[group] || "stations";

  if (group === "gov-military") {
    return handleGovMilitary();
  }

  const key = `tle:${slug}`;
  const cached = cacheGet<Tle[]>(key);
  if (cached && cached.age < TLE_TTL_LIVE_MS) {
    return tleResponse(slug, cached.data, "live", cached.age);
  }

  try {
    const text = await fetchText(
      `https://celestrak.org/NORAD/elements/gp.php?GROUP=${slug}&FORMAT=tle`,
      { headers: CELESTRAK_HEADERS },
      20_000,
    );
    const tles = parseTle(text).slice(0, 600);
    cacheSet(key, tles);
    return tleResponse(slug, tles, "live", 0);
  } catch (e) {
    if (cached && cached.age < TLE_TTL_STALE_MS) {
      return tleResponse(slug, cached.data, "degraded", cached.age, String(e).slice(0, 120));
    }
    return tleResponse(slug, [], "stale", cached?.age ?? 0, String(e).slice(0, 120));
  }
}
