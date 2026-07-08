import { NextResponse } from "next/server";
import { fetchJSON } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";

export interface MetarObservation {
  icaoId?: string;
  receiptTime?: string;
  obsTime?: number;
  reportTime?: string;
  temp?: number;
  dewp?: number;
  wdir?: number;
  wspd?: number;
  visib?: string | number;
  altim?: number;
  clouds?: { cover?: string; base?: number }[];
  rawOb?: string;
}

const TTL_MS = 5 * 60_000;

export async function GET(req: Request) {
  const icao = new URL(req.url).searchParams.get("icao")?.trim().toUpperCase();
  if (!icao || !/^[A-Z0-9]{3,4}$/.test(icao)) {
    return NextResponse.json({ error: "icao query param required (3–4 chars)" }, { status: 400 });
  }

  const cacheKey = `metar:${icao}`;
  const cached = cacheGet<MetarObservation[]>(cacheKey);
  if (cached && cached.age < TTL_MS) {
    return NextResponse.json({ icao, observations: cached.data }, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }

  try {
    const url = `https://aviationweather.gov/api/data/metar?ids=${icao}&format=json&hours=24`;
    const observations = await fetchJSON<MetarObservation[]>(url, {}, 12_000);
    const sorted = [...(observations ?? [])].sort(
      (a, b) => (a.obsTime ?? 0) - (b.obsTime ?? 0),
    );
    cacheSet(cacheKey, sorted);
    return NextResponse.json({ icao, observations: sorted }, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    if (cached) {
      return NextResponse.json({ icao, observations: cached.data, stale: true });
    }
    return NextResponse.json(
      { error: String(e).slice(0, 120) },
      { status: 502 },
    );
  }
}
