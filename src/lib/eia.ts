import { fetchJSON } from "@/lib/http";

export interface EiaSeriesPoint {
  period: string;
  value: number;
}

export interface EiaSeries {
  id: string;
  name: string;
  unit: string;
  latest?: EiaSeriesPoint;
  points: EiaSeriesPoint[];
}

export interface FredMacroSeries {
  id: string;
  name: string;
  unit: string;
  latest?: EiaSeriesPoint;
}

const SERIES = [
  { id: "PET.MCRFPUS2.M", name: "US crude oil field production", unit: "Mbbl/d" },
  { id: "PET.WTESTUS1.W", name: "US crude + petroleum stocks", unit: "Mbbl" },
] as const;

const FRED_MACRO = {
  id: "PNGASEUUSDM",
  name: "Global price of Natural gas, EU",
  unit: "USD/MMBtu",
} as const;

export async function fetchEiaSeries(apiKey: string): Promise<EiaSeries[]> {
  const out: EiaSeries[] = [];
  for (const s of SERIES) {
    const url = `https://api.eia.gov/v2/seriesid/${s.id}?api_key=${apiKey}&data[]=value&sort[0][column]=period&sort[0][direction]=desc&length=52`;
    try {
      const json = await fetchJSON<{
        response?: { data?: { period: string; value: string }[] };
      }>(url, {}, 20_000);
      const rows = json.response?.data ?? [];
      const points = rows
        .map((r) => ({ period: r.period, value: parseFloat(r.value) }))
        .filter((p) => Number.isFinite(p.value))
        .reverse();
      out.push({
        id: s.id,
        name: s.name,
        unit: s.unit,
        latest: points.length ? points[points.length - 1] : undefined,
        points: points.slice(-24),
      });
    } catch {
      out.push({ id: s.id, name: s.name, unit: s.unit, points: [] });
    }
  }
  return out;
}

export async function fetchFredNaturalGas(apiKey: string): Promise<FredMacroSeries | null> {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${FRED_MACRO.id}&api_key=${apiKey}&sort_order=desc&limit=1&file_type=json`;
  try {
    const json = await fetchJSON<{ observations?: { date: string; value: string }[] }>(url, {}, 20_000);
    const row = json.observations?.find((o) => Number.isFinite(parseFloat(o.value)));
    if (!row) return null;
    const value = parseFloat(row.value);
    return {
      id: FRED_MACRO.id,
      name: FRED_MACRO.name,
      unit: FRED_MACRO.unit,
      latest: { period: row.date, value },
    };
  } catch {
    return null;
  }
}
