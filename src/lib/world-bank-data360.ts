import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fetchJSON } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";

const D360_BASE = "https://data360api.worldbank.org/data360/data";

export const D360_INDICATORS = {
  gdp: "WB_WDI_NY_GDP_MKTP_CD",
  population: "WB_WDI_SP_POP_TOTL",
  milExp: "WB_WDI_MS_MIL_XPND_CD",
  milExpPctGdp: "WB_WDI_MS_MIL_XPND_GD_ZS",
  personnel: "WB_WDI_MS_MIL_TOTL_P1",
  gdpGrowth: "WB_WDI_NY_GDP_MKTP_KD_ZG",
  inflation: "WB_WDI_FP_CPI_TOTL_ZG",
  currentAccount: "WB_WDI_BN_CAB_XOKA_GD_ZS",
  armsImports: "WB_WDI_MS_MIL_MPRT_KD",
  armsExports: "WB_WDI_MS_MIL_XPRT_KD",
} as const;

export type D360Key = keyof typeof D360_INDICATORS;

interface D360Row {
  REF_AREA: string;
  INDICATOR: string;
  TIME_PERIOD: string;
  OBS_VALUE: string;
}

type CountrySeriesMap = Record<string, Partial<Record<D360Key, { year: number; value: number }[]>>>;

const INDICATOR_BY_CODE = Object.fromEntries(
  Object.entries(D360_INDICATORS).map(([k, v]) => [v, k as D360Key]),
) as Record<string, D360Key>;

let bulk: CountrySeriesMap | null = null;
let bulkPromise: Promise<CountrySeriesMap> | null = null;

function loadIsoList(): string[] {
  const text = readFileSync(
    join(process.cwd(), "static-data/world-bank/world-bank-countries.csv"),
    "utf8",
  );
  return text
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(",")[0]?.trim())
    .filter((c): c is string => !!c && /^[A-Z]{3}$/.test(c));
}

function mergeRows(out: CountrySeriesMap, rows: D360Row[]) {
  for (const row of rows) {
    const key = INDICATOR_BY_CODE[row.INDICATOR];
    if (!key) continue;
    const year = parseInt(row.TIME_PERIOD, 10);
    const value = parseFloat(row.OBS_VALUE);
    if (!row.REF_AREA || !Number.isFinite(year) || Number.isNaN(value)) continue;
    if (!out[row.REF_AREA]) out[row.REF_AREA] = {};
    if (!out[row.REF_AREA][key]) out[row.REF_AREA][key] = [];
    out[row.REF_AREA][key]!.push({ year, value });
  }
}

function sortSeries(out: CountrySeriesMap) {
  for (const iso of Object.keys(out)) {
    for (const k of Object.keys(out[iso]!) as D360Key[]) {
      out[iso]![k]!.sort((a, b) => a.year - b.year);
    }
  }
}

async function fetchBatch(isos: string[]): Promise<D360Row[]> {
  const all: D360Row[] = [];
  let skip = 0;
  while (true) {
    const params = new URLSearchParams({
      DATABASE_ID: "WB_WDI",
      INDICATOR: Object.values(D360_INDICATORS).join(","),
      REF_AREA: isos.join(","),
      timePeriodFrom: "1996",
      timePeriodTo: "2026",
      skip: String(skip),
    });
    const json = await fetchJSON<{ count?: number; value?: D360Row[] }>(
      `${D360_BASE}?${params}`,
      {},
      45_000,
    );
    const rows = json.value ?? [];
    all.push(...rows);
    const total = json.count ?? rows.length;
    skip += rows.length;
    if (rows.length === 0 || skip >= total) break;
  }
  return all;
}

export async function ensureD360Bulk(): Promise<CountrySeriesMap> {
  if (bulk) return bulk;
  const cached = cacheGet<CountrySeriesMap>("d360:bulk");
  if (cached && cached.age < 30 * 24 * 3_600_000) {
    bulk = cached.data;
    return bulk;
  }

  const diskPath = join(process.cwd(), "public/data/wb-country-indicators.json");
  if (existsSync(diskPath)) {
    try {
      const file = JSON.parse(readFileSync(diskPath, "utf8")) as {
        countries?: Record<string, { raw?: CountrySeriesMap[string] }>;
      };
      const out: CountrySeriesMap = {};
      for (const [iso, entry] of Object.entries(file.countries ?? {})) {
        if (entry.raw) out[iso] = entry.raw;
      }
      if (Object.keys(out).length > 0) {
        bulk = out;
        cacheSet("d360:bulk", out);
        return out;
      }
    } catch {
      /* fall through to live fetch */
    }
  }

  if (bulkPromise) return bulkPromise;

  bulkPromise = (async () => {
    const isos = loadIsoList();
    const out: CountrySeriesMap = {};
    const BATCH = 35;
    for (let i = 0; i < isos.length; i += BATCH) {
      const rows = await fetchBatch(isos.slice(i, i + BATCH));
      mergeRows(out, rows);
    }
    sortSeries(out);
    bulk = out;
    cacheSet("d360:bulk", out);
    return out;
  })();

  try {
    return await bulkPromise;
  } finally {
    bulkPromise = null;
  }
}

export function getD360Series(iso: string, key: D360Key): { year: number; value: number }[] {
  return bulk?.[iso]?.[key] ?? [];
}

export async function getD360SeriesAsync(
  iso: string,
  key: D360Key,
): Promise<{ year: number; value: number }[]> {
  await ensureD360Bulk();
  return getD360Series(iso, key);
}
