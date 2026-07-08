import { NextResponse } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { cacheTtl } from "@/config/cache-schedule";
import {
  CORE_TICKERS,
  EXTENDED_TICKERS,
  fetchMarketQuotes,
  fetchQuoteHistory,
  isUsMarketHours,
} from "@/lib/yahoo-markets";

export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const historySymbol = url.searchParams.get("history");
  if (historySymbol) {
    try {
      const points = await fetchQuoteHistory(historySymbol, 90);
      return NextResponse.json({ symbol: historySymbol, points });
    } catch (e) {
      return NextResponse.json({ error: String(e).slice(0, 120) }, { status: 502 });
    }
  }

  const extended = url.searchParams.get("extended") === "1";
  const meta = extended ? [...CORE_TICKERS, ...EXTENDED_TICKERS] : CORE_TICKERS;
  const symbols = meta.map((m) => m.symbol);
  const ttl = isUsMarketHours() ? cacheTtl("ops:yahoo", 5 * 60_000) : cacheTtl("ops:yahoo", 60 * 60_000);
  const key = `ops:markets:${extended ? "ext" : "core"}`;
  const cached = cacheGet<{ quotes: Awaited<ReturnType<typeof fetchMarketQuotes>> }>(key);
  if (cached && cached.age < ttl) {
    return NextResponse.json(cached.data, { headers: { "X-Panoptes-Health": "live" } });
  }

  try {
    const quotes = await fetchMarketQuotes(symbols, meta);
    const payload = { quotes };
    cacheSet(key, payload);
    return NextResponse.json(payload, { headers: { "X-Panoptes-Health": "live" } });
  } catch (e) {
    if (cached) {
      return NextResponse.json(cached.data, { headers: { "X-Panoptes-Health": "stale" } });
    }
    return NextResponse.json({ quotes: [], error: String(e).slice(0, 120) }, {
      status: 502,
      headers: { "X-Panoptes-Health": "offline" },
    });
  }
}
