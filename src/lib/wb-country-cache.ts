import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fetchJSON } from "@/lib/http";
import {
  D360_INDICATORS,
  type D360Key,
  ensureD360Bulk,
  getD360Series,
} from "@/lib/world-bank-data360";

export interface WbCountryEntry {
  latest: Record<string, number | undefined>;
  series: {
    milExp: { year: number; value: number }[];
    milExpPctGdp: { year: number; value: number }[];
  };
  raw?: Partial<Record<D360Key, { year: number; value: number }[]>>;
}

interface WbCacheFile {
  builtAt?: string;
  countries: Record<string, WbCountryEntry>;
}

let fileCache: WbCacheFile | null = null;

function loadFile(): WbCacheFile | null {
  if (fileCache) return fileCache;
  const p = join(process.cwd(), "public/data/wb-country-indicators.json");
  if (!existsSync(p)) return null;
  try {
    fileCache = JSON.parse(readFileSync(p, "utf8")) as WbCacheFile;
    return fileCache;
  } catch {
    return null;
  }
}

export function wbCountryFromFile(iso: string): WbCountryEntry | undefined {
  return loadFile()?.countries[iso];
}

async function fetchD360Single(
  iso: string,
  key: D360Key,
): Promise<{ year: number; value: number }[]> {
  const params = new URLSearchParams({
    DATABASE_ID: "WB_WDI",
    INDICATOR: D360_INDICATORS[key],
    REF_AREA: iso,
    timePeriodFrom: "1996",
    timePeriodTo: "2026",
    skip: "0",
  });
  const json = await fetchJSON<{
    value?: { TIME_PERIOD: string; OBS_VALUE: string }[];
  }>(`https://data360api.worldbank.org/data360/data?${params}`, {}, 20_000);
  return (json.value ?? [])
    .map((r) => ({ year: parseInt(r.TIME_PERIOD, 10), value: parseFloat(r.OBS_VALUE) }))
    .filter((p) => Number.isFinite(p.year) && !Number.isNaN(p.value))
    .sort((a, b) => a.year - b.year);
}

export async function getWbCountryData(iso: string): Promise<WbCountryEntry> {
  const fromFile = wbCountryFromFile(iso);
  if (fromFile) return fromFile;

  await ensureD360Bulk();
  const keys = Object.keys(D360_INDICATORS) as D360Key[];
  const raw: Partial<Record<D360Key, { year: number; value: number }[]>> = {};
  await Promise.all(
    keys.map(async (k) => {
      let s = getD360Series(iso, k);
      if (!s.length) s = await fetchD360Single(iso, k);
      if (s.length) raw[k] = s;
    }),
  );

  const milExp = raw.milExp ?? [];
  const milExpPctGdp = raw.milExpPctGdp ?? [];
  const latestVal = (k: D360Key) => {
    const s = raw[k];
    return s?.length ? s[s.length - 1] : undefined;
  };

  return {
    latest: {
      gdp: latestVal("gdp")?.value,
      population: latestVal("population")?.value,
      milExp: latestVal("milExp")?.value,
      milExpPctGdp: latestVal("milExpPctGdp")?.value,
      personnel: latestVal("personnel")?.value,
      gdpGrowth: latestVal("gdpGrowth")?.value,
      inflation: latestVal("inflation")?.value,
      currentAccount: latestVal("currentAccount")?.value,
      armsImports: latestVal("armsImports")?.value,
      armsImportsYear: latestVal("armsImports")?.year,
      armsExports: latestVal("armsExports")?.value,
      armsExportsYear: latestVal("armsExports")?.year,
    },
    series: { milExp, milExpPctGdp },
    raw,
  };
}
