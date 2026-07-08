import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { cacheTtl } from "@/config/cache-schedule";
import { loadTradeIndicators } from "@/lib/trade-indicators";

export const maxDuration = 45;

export async function GET() {
  const ttl = cacheTtl("ops:trade-bundle", 24 * 60 * 60_000);
  const key = "ops:trade-bundle";
  const cached = cacheGet<Awaited<ReturnType<typeof loadTradeIndicators>>>(key);
  if (cached && cached.age < ttl) {
    return NextResponse.json(cached.data, { headers: { "X-Panoptes-Health": "live" } });
  }

  try {
    const data = await loadTradeIndicators();
    cacheSet(key, data);
    const hasFred = data.fred.length > 0;
    const hasComtrade = data.comtrade.length > 0;
    const health = hasFred || data.gscpi.length || data.reer.length ? (hasComtrade ? "live" : "degraded") : "degraded";
    return NextResponse.json(data, { headers: { "X-Panoptes-Health": health } });
  } catch (e) {
    if (cached) {
      return NextResponse.json(cached.data, { headers: { "X-Panoptes-Health": "stale" } });
    }
    return NextResponse.json({ error: String(e).slice(0, 120) }, {
      status: 502,
      headers: { "X-Panoptes-Health": "offline" },
    });
  }
}
