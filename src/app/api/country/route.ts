import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { cacheTtl } from "@/config/cache-schedule";
import { EMPTY_COUNTRY_SERIES, normalizeCountryPayload } from "@/lib/country-payload";
import { battleDeathsFor, homicidesFor } from "@/lib/static-data";
import { getWbCountryData, wbCountryFromFile } from "@/lib/wb-country-cache";

export const maxDuration = 60;

export async function GET(req: Request) {
  const iso = (new URL(req.url).searchParams.get("iso") || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso)) {
    return NextResponse.json({ error: "iso (3-letter) required" }, { status: 400 });
  }

  const ttl = cacheTtl("world-bank:country");
  const key = `country:v4:${iso}`;
  const cached = cacheGet<unknown>(key);
  if (cached && cached.age < ttl) {
    return NextResponse.json(normalizeCountryPayload(cached.data, iso), {
      headers: { "X-Panoptes-Health": "live" },
    });
  }

  try {
    const wb = await getWbCountryData(iso);
    const { tracked: battleTracked, series: battleDeaths } = battleDeathsFor(iso);
    const hom = homicidesFor(iso);
    const homicide = hom.country;
    const homicideWorld = hom.world;

    const latest = wb.latest;
    const result = normalizeCountryPayload({
      iso,
      latest: {
        gdp: latest.gdp,
        population: latest.population,
        milExp: latest.milExp,
        milExpPctGdp: latest.milExpPctGdp,
        personnel: latest.personnel,
        gdpGrowth: latest.gdpGrowth,
        inflation: latest.inflation,
        currentAccount: latest.currentAccount,
        battleDeaths: battleDeaths.length ? battleDeaths[battleDeaths.length - 1]?.value : undefined,
        battleDeathsYear: battleDeaths.length ? battleDeaths[battleDeaths.length - 1]?.year : undefined,
        battleDeathsTracked: battleTracked,
        homicideRate: homicide.length ? homicide[homicide.length - 1]?.value : undefined,
        homicideYear: homicide.length ? homicide[homicide.length - 1]?.year : undefined,
        homicideWorldRate: homicideWorld.length ? homicideWorld[homicideWorld.length - 1]?.value : undefined,
        homicideWorldYear: homicideWorld.length ? homicideWorld[homicideWorld.length - 1]?.year : undefined,
        armsImports: latest.armsImports,
        armsImportsYear: latest.armsImportsYear,
        armsExports: latest.armsExports,
        armsExportsYear: latest.armsExportsYear,
      },
      series: {
        milExp: wb.series.milExp,
        milExpPctGdp: wb.series.milExpPctGdp,
        battleDeaths,
        homicide,
        homicideWorld,
      },
      macro: {
        gdpGrowth: latest.gdpGrowth,
        inflation: latest.inflation,
        currentAccount: latest.currentAccount,
      },
    }, iso);

    cacheSet(key, result);
    return NextResponse.json(result, {
      headers: { "X-Panoptes-Health": wbCountryFromFile(iso) ? "cached" : "live" },
    });
  } catch (e) {
    if (cached) {
      return NextResponse.json(normalizeCountryPayload(cached.data, iso), {
        headers: { "X-Panoptes-Health": "degraded" },
      });
    }
    return NextResponse.json(
      normalizeCountryPayload(
        { iso, latest: {}, series: EMPTY_COUNTRY_SERIES(), error: String(e).slice(0, 120) },
        iso,
      ),
      { headers: { "X-Panoptes-Health": "stale" } },
    );
  }
}
