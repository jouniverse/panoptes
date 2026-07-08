import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { cacheTtl } from "@/config/cache-schedule";
import { fetchEiaSeries, fetchFredNaturalGas } from "@/lib/eia";

export const maxDuration = 25;

export async function GET() {
  const eiaKey = process.env.EIA_API_KEY;
  const fredKey = process.env.FRED_API_KEY;
  if (!eiaKey && !fredKey) {
    return NextResponse.json(
      { series: [], fred: null, error: "EIA_API_KEY or FRED_API_KEY required" },
      { status: 503, headers: { "X-Panoptes-Health": "offline" } },
    );
  }

  const ttl = cacheTtl("ops:eia", 7 * 24 * 60 * 60_000);
  const key = "ops:eia";
  const cached = cacheGet<{
    series: Awaited<ReturnType<typeof fetchEiaSeries>>;
    fred: Awaited<ReturnType<typeof fetchFredNaturalGas>>;
  }>(key);
  if (cached && cached.age < ttl) {
    return NextResponse.json(cached.data, { headers: { "X-Panoptes-Health": "live" } });
  }

  try {
    const [series, fred] = await Promise.all([
      eiaKey ? fetchEiaSeries(eiaKey) : Promise.resolve([]),
      fredKey ? fetchFredNaturalGas(fredKey) : Promise.resolve(null),
    ]);
    const payload = { series, fred };
    cacheSet(key, payload);
    return NextResponse.json(payload, { headers: { "X-Panoptes-Health": "live" } });
  } catch (e) {
    if (cached) {
      return NextResponse.json(cached.data, { headers: { "X-Panoptes-Health": "stale" } });
    }
    return NextResponse.json({ series: [], fred: null, error: String(e).slice(0, 120) }, {
      status: 502,
      headers: { "X-Panoptes-Health": "offline" },
    });
  }
}
