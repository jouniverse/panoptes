import { NextResponse } from "next/server";
import { fetchJSON } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";

export const maxDuration = 25;

// World Bank Open Data — free, no key. Strategic country indicators + a
// military-expenditure time series for the analytics profile.
const INDICATORS = {
  gdp: "NY.GDP.MKTP.CD",
  population: "SP.POP.TOTL",
  milExp: "MS.MIL.XPND.CD",
  milExpPctGdp: "MS.MIL.XPND.GD.ZS",
  personnel: "MS.MIL.TOTL.P1",
} as const;

type Key = keyof typeof INDICATORS;

interface WBPoint {
  date: string;
  value: number | null;
}

async function series(iso: string, indicator: string): Promise<{ year: number; value: number }[]> {
  const url = `https://api.worldbank.org/v2/country/${iso}/indicator/${indicator}?format=json&per_page=70`;
  const json = await fetchJSON<[unknown, WBPoint[] | null]>(url);
  const rows = json[1] ?? [];
  return rows
    .filter((r) => r.value != null)
    .map((r) => ({ year: parseInt(r.date, 10), value: r.value as number }))
    .sort((a, b) => a.year - b.year);
}

function latest(s: { year: number; value: number }[]): number | undefined {
  return s.length ? s[s.length - 1].value : undefined;
}

export async function GET(req: Request) {
  const iso = (new URL(req.url).searchParams.get("iso") || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso)) {
    return NextResponse.json({ error: "iso (3-letter) required" }, { status: 400 });
  }
  const key = `country:${iso}`;
  const cached = cacheGet<unknown>(key);
  if (cached && cached.age < 24 * 3_600_000) {
    return NextResponse.json(cached.data, { headers: { "X-Panoptes-Health": "live" } });
  }

  try {
    const entries = await Promise.all(
      (Object.entries(INDICATORS) as [Key, string][]).map(async ([k, ind]) => [k, await series(iso, ind)] as const),
    );
    const byKey = Object.fromEntries(entries) as Record<Key, { year: number; value: number }[]>;
    const result = {
      iso,
      latest: {
        gdp: latest(byKey.gdp),
        population: latest(byKey.population),
        milExp: latest(byKey.milExp),
        milExpPctGdp: latest(byKey.milExpPctGdp),
        personnel: latest(byKey.personnel),
      },
      series: { milExp: byKey.milExp, milExpPctGdp: byKey.milExpPctGdp },
    };
    cacheSet(key, result);
    return NextResponse.json(result, { headers: { "X-Panoptes-Health": "live" } });
  } catch (e) {
    if (cached) return NextResponse.json(cached.data, { headers: { "X-Panoptes-Health": "degraded" } });
    return NextResponse.json(
      { iso, latest: {}, series: { milExp: [] }, error: String(e).slice(0, 120) },
      { headers: { "X-Panoptes-Health": "stale" } },
    );
  }
}
