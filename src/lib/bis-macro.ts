import { cacheGet, cacheSet } from "@/lib/cache";
import { isoMaps } from "@/lib/static-data";
import { fetchText } from "@/lib/http";

export interface BisCountryMacro {
  cbpr?: { value: number; period: string };
  creditToGdp?: { value: number; period: string };
  reer?: { value: number; period: string };
}

interface BisCache {
  cbpr: Record<string, { value: number; period: string }>;
  credit: Record<string, { value: number; period: string }>;
  reer: Record<string, { value: number; period: string }>;
}

let cache: BisCache | null = null;
let loading: Promise<BisCache> | null = null;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function colIndex(header: string[], name: string): number {
  const i = header.indexOf(name);
  return i >= 0 ? i : -1;
}

async function fetchCsv(url: string): Promise<string[][]> {
  const text = await fetchText(url, { headers: { Accept: "text/csv" } }, 30_000);
  return parseCsv(text);
}

async function loadBis(): Promise<BisCache> {
  const cached = cacheGet<BisCache>("bis:macro");
  if (cached && cached.age < 24 * 3_600_000) return cached.data;

  const [cbprRows, creditRows, reerRows] = await Promise.all([
    fetchCsv(
      "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/~/M?lastNObservations=1&detail=full&format=csv",
    ),
    fetchCsv(
      "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CREDIT_GAP/~/*?lastNObservations=1&detail=full&format=csv",
    ),
    fetchCsv(
      "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_EER/~/M?lastNObservations=1&detail=full&format=csv",
    ),
  ]);

  const cbpr: BisCache["cbpr"] = {};
  if (cbprRows.length > 1) {
    const h = cbprRows[0];
    const areaI = colIndex(h, "REF_AREA");
    const periodI = colIndex(h, "TIME_PERIOD");
    const valueI = colIndex(h, "OBS_VALUE");
    for (let i = 1; i < cbprRows.length; i++) {
      const r = cbprRows[i];
      const area = r[areaI];
      const value = parseFloat(r[valueI]);
      if (!area || !Number.isFinite(value)) continue;
      cbpr[area] = { value, period: r[periodI] ?? "" };
    }
  }

  const credit: BisCache["credit"] = {};
  if (creditRows.length > 1) {
    const h = creditRows[0];
    const freqI = colIndex(h, "FREQ");
    const areaI = colIndex(h, "BORROWERS_CTY");
    const dtypeI = colIndex(h, "CG_DTYPE");
    const periodI = colIndex(h, "TIME_PERIOD");
    const valueI = colIndex(h, "OBS_VALUE");
    for (let i = 1; i < creditRows.length; i++) {
      const r = creditRows[i];
      if (r[freqI] !== "Q" || r[dtypeI] !== "B") continue;
      const area = r[areaI];
      const value = parseFloat(r[valueI]);
      if (!area || !Number.isFinite(value)) continue;
      credit[area] = { value, period: r[periodI] ?? "" };
    }
  }

  const reer: BisCache["reer"] = {};
  if (reerRows.length > 1) {
    const h = reerRows[0];
    const freqI = colIndex(h, "FREQ");
    const typeI = colIndex(h, "EER_TYPE");
    const basketI = colIndex(h, "EER_BASKET");
    const areaI = colIndex(h, "REF_AREA");
    const periodI = colIndex(h, "TIME_PERIOD");
    const valueI = colIndex(h, "OBS_VALUE");
    for (let i = 1; i < reerRows.length; i++) {
      const r = reerRows[i];
      if (r[freqI] !== "M" || r[typeI] !== "R" || r[basketI] !== "B") continue;
      const area = r[areaI];
      const value = parseFloat(r[valueI]);
      if (!area || !Number.isFinite(value)) continue;
      reer[area] = { value, period: r[periodI] ?? "" };
    }
  }

  const out = { cbpr, credit, reer };
  cacheSet("bis:macro", out);
  return out;
}

export async function ensureBisData(): Promise<BisCache> {
  if (cache) return cache;
  if (loading) return loading;
  loading = loadBis().then((d) => {
    cache = d;
    loading = null;
    return d;
  });
  return loading;
}

export const OPS_REER_COUNTRIES = [
  { label: "Euro Area", area: "XM" },
  { label: "USA", area: "US" },
  { label: "China", area: "CN" },
  { label: "Japan", area: "JP" },
  { label: "Switzerland", area: "CH" },
  { label: "UK", area: "GB" },
  { label: "Brazil", area: "BR" },
  { label: "Russia", area: "RU" },
] as const;

export async function reerForOpsCountries(): Promise<
  { label: string; value: number; period: string }[]
> {
  const data = await ensureBisData();
  return OPS_REER_COUNTRIES.map(({ label, area }) => {
    const hit = data.reer[area];
    return hit ? { label, value: hit.value, period: hit.period } : { label, value: NaN, period: "" };
  }).filter((r) => Number.isFinite(r.value));
}

export async function bisMacroForIso3(iso3: string): Promise<BisCountryMacro> {
  const maps = isoMaps();
  const iso2 = maps.iso3to2[iso3];
  if (!iso2) return {};
  const elig = maps.bis[iso2];
  if (!elig) return {};

  const data = await ensureBisData();
  const out: BisCountryMacro = {};

  const cbprKey = elig.cbpr === "XM" ? "XM" : elig.cbpr || iso2;
  if (elig.cbpr && data.cbpr[cbprKey]) out.cbpr = data.cbpr[cbprKey];

  const creditKey = elig.credit || iso2;
  if (elig.credit && data.credit[creditKey]) out.creditToGdp = data.credit[creditKey];

  const reerKey = elig.reer || iso2;
  if (elig.reer && data.reer[reerKey]) out.reer = data.reer[reerKey];

  return out;
}
