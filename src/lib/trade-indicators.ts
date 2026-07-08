import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchJSON, fetchText } from "@/lib/http";
import { reerForOpsCountries } from "@/lib/bis-macro";
import { fetchMarketQuotes } from "@/lib/yahoo-markets";

export interface FredSeries {
  id: string;
  name: string;
  points: { date: string; value: number }[];
  latest?: number;
  zScore?: number;
}

export interface GscpiPoint {
  date: string;
  value: number;
}

export interface ComtradeLiveItem {
  reporter: string;
  reporterCode: string;
  period: number;
  classification: string;
  status: string;
  lastUpdated?: string;
  freqCode?: string;
  typeCode?: string;
}

let reporterMap: Map<string, string> | null = null;

function loadReporterMap(): Map<string, string> {
  if (reporterMap) return reporterMap;
  const csv = readFileSync(
    join(process.cwd(), "static-data/country-codes/un-comtrade-reporter-countries.csv"),
    "utf8",
  );
  const map = new Map<string, string>();
  for (const line of csv.split("\n").slice(1)) {
    const cols = line.split(",");
    const code = cols[2]?.trim();
    const name = cols[3]?.trim();
    if (code && name) map.set(code, name);
  }
  reporterMap = map;
  return map;
}

async function fetchFredSeries(apiKey: string, seriesId: string, name: string): Promise<FredSeries> {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&sort_order=desc&limit=24&file_type=json`;
  const json = await fetchJSON<{ observations?: { date: string; value: string }[] }>(url, {}, 20_000);
  const points = (json.observations ?? [])
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((p) => Number.isFinite(p.value))
    .reverse();
  const values = points.map((p) => p.value);
  const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const std = Math.sqrt(
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(values.length - 1, 1),
  );
  const latest = values.length ? values[values.length - 1] : undefined;
  const zScore = latest != null && std > 0 ? (latest - mean) / std : undefined;
  return { id: seriesId, name, points, latest, zScore };
}

function parseGscpiCsv(text: string): GscpiPoint[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const lastCol = header.length - 1;
  const out: GscpiPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const date = cols[0]?.trim();
    const val = parseFloat(cols[lastCol]);
    if (!date || Number.isNaN(val)) continue;
    out.push({ date, value: val });
  }
  return out;
}

export async function loadTradeIndicators(): Promise<{
  fred: FredSeries[];
  gscpi: GscpiPoint[];
  gscpiLatest?: number;
  reer: { label: string; value: number; period: string }[];
  bdry?: { price: number | null; changePct: number | null };
  comtrade: ComtradeLiveItem[];
}> {
  const fredKey = process.env.FRED_API_KEY;
  const comtradeKey = process.env.UN_COMTRADE_API_KEY;

  const [fred, gscpiText, reer, bdryQuotes, comtradeRaw] = await Promise.all([
    fredKey
      ? Promise.all([
          fetchFredSeries(fredKey, "PCU483111483111", "Deep Sea Freight PPI"),
          fetchFredSeries(fredKey, "TSIFRGHT", "Freight Transportation Index"),
        ])
      : Promise.resolve([] as FredSeries[]),
    fetchText(
      "https://www.newyorkfed.org/medialibrary/research/interactives/data/gscpi/gscpi_interactive_data.csv",
      {},
      25_000,
    ).catch(() => ""),
    reerForOpsCountries(),
    fetchMarketQuotes(["BDRY"], [{ symbol: "BDRY", name: "Dry Bulk Shipping ETF" }]).catch(() => []),
    comtradeKey
      ? fetchJSON<{ data?: Record<string, unknown>[] }>(
          `https://comtradeapi.un.org/data/v1/getLiveUpdate?subscription-key=${comtradeKey}`,
          {},
          20_000,
        ).catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] }),
  ]);

  const gscpi = gscpiText ? parseGscpiCsv(gscpiText) : [];
  const gscpiLatest = gscpi.length ? gscpi[gscpi.length - 1].value : undefined;
  const reporters = loadReporterMap();
  const comtrade = (comtradeRaw.data ?? []).slice(0, 30).map((row) => {
    const code = String(row.reporterCode ?? "");
    return {
      reporter: reporters.get(code) ?? code,
      reporterCode: code,
      period: Number(row.period) || 0,
      classification: String(row.classificationCode ?? ""),
      status: String(row.status ?? ""),
      lastUpdated: row.lastUpdated ? String(row.lastUpdated) : undefined,
      freqCode: row.freqCode ? String(row.freqCode) : undefined,
      typeCode: row.typeCode ? String(row.typeCode) : undefined,
    };
  });

  const bdry = bdryQuotes[0];

  return {
    fred,
    gscpi,
    gscpiLatest,
    reer,
    bdry: bdry ? { price: bdry.price, changePct: bdry.changePct } : undefined,
    comtrade,
  };
}
