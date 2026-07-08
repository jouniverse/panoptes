import { fetchJSON } from "@/lib/http";

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
}

export const CORE_TICKERS: { symbol: string; name: string }[] = [
  { symbol: "BZ=F", name: "Brent Crude" },
  { symbol: "CL=F", name: "WTI Crude" },
  { symbol: "NG=F", name: "Natural Gas" },
  { symbol: "GC=F", name: "Gold Futures" },
  { symbol: "^VIX", name: "VIX" },
  { symbol: "^TNX", name: "US 10Y Yield" },
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "IXC", name: "Global Energy ETF" },
  { symbol: "ITA", name: "Aerospace & Defense ETF" },
  { symbol: "LMT", name: "Lockheed Martin" },
  { symbol: "DX-Y.NYB", name: "US Dollar Index" },
  { symbol: "EURUSD=X", name: "EUR/USD" },
];

export const EXTENDED_TICKERS: { symbol: string; name: string }[] = [
  { symbol: "^IXIC", name: "NASDAQ" },
  { symbol: "^DJI", name: "Dow Jones" },
  { symbol: "SI=F", name: "Silver Futures" },
  { symbol: "HG=F", name: "Copper Futures" },
  { symbol: "PA=F", name: "Palladium Futures" },
  { symbol: "RUB=X", name: "USD/RUB" },
  { symbol: "CNY=X", name: "USD/CNY" },
  { symbol: "BDRY", name: "Dry Bulk Shipping ETF" },
];

interface ChartMeta {
  symbol?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  shortName?: string;
  longName?: string;
}

interface ChartResponse {
  chart?: { result?: { meta?: ChartMeta }[] };
}

export function isUsMarketHours(): boolean {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

async function fetchChartQuote(symbol: string): Promise<MarketQuote | null> {
  const enc = encodeURIComponent(symbol);
  const json = await fetchJSON<ChartResponse>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=5d`,
    {},
    12_000,
  );
  const meta = json.chart?.result?.[0]?.meta;
  if (!meta?.symbol) return null;
  const price = meta.regularMarketPrice ?? null;
  const prev = meta.chartPreviousClose;
  const changePct =
    price != null && prev != null && prev !== 0 ? ((price - prev) / prev) * 100 : null;
  return {
    symbol: meta.symbol,
    name: meta.shortName ?? meta.longName ?? meta.symbol,
    price: price != null ? Number(price) : null,
    changePct: changePct != null ? Number(changePct) : null,
  };
}

/** Fetch quotes via Yahoo Finance chart API (no third-party npm client). */
export async function fetchMarketQuotes(
  symbols: string[],
  meta: { symbol: string; name: string }[],
): Promise<MarketQuote[]> {
  if (!symbols.length) return [];
  const results = await Promise.allSettled(symbols.map((s) => fetchChartQuote(s)));
  return results
    .flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []))
    .map((q) => {
      const m = meta.find((x) => x.symbol === q.symbol);
      return m ? { ...q, name: m.name } : q;
    });
}

export async function fetchQuoteHistory(
  symbol: string,
  days = 90,
): Promise<{ date: string; value: number }[]> {
  const range = days <= 30 ? "1mo" : days <= 90 ? "3mo" : "6mo";
  const enc = encodeURIComponent(symbol);
  const json = await fetchJSON<{
    chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
  }>(`https://query1.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=${range}`, {}, 15_000);
  const result = json.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  return ts
    .map((t, i) => ({
      date: new Date(t * 1000).toISOString().slice(0, 10),
      value: closes[i] ?? NaN,
    }))
    .filter((p) => Number.isFinite(p.value));
}
