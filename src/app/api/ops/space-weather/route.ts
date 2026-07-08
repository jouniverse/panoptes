import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { cacheTtl } from "@/config/cache-schedule";
import { loadSpaceWeather } from "@/lib/space-weather";

export const maxDuration = 20;

export async function GET() {
  const ttl = cacheTtl("ops:space-weather", 60 * 60_000);
  const key = "ops:space-weather";
  const cached = cacheGet<Awaited<ReturnType<typeof loadSpaceWeather>>>(key);
  if (cached && cached.age < ttl) {
    return NextResponse.json(cached.data, { headers: { "X-Panoptes-Health": "live" } });
  }
  try {
    const data = await loadSpaceWeather();
    cacheSet(key, data);
    return NextResponse.json(data, { headers: { "X-Panoptes-Health": "live" } });
  } catch (e) {
    if (cached) {
      return NextResponse.json(cached.data, { headers: { "X-Panoptes-Health": "stale" } });
    }
    return NextResponse.json({ error: String(e).slice(0, 120) }, { status: 502, headers: { "X-Panoptes-Health": "offline" } });
  }
}
