import { NextResponse } from "next/server";
import { fetchText } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";
import { cacheTtl } from "@/config/cache-schedule";
import { parseRssFeed } from "@/lib/rss";

export const maxDuration = 25;

const FEED_URL =
  "https://www.defensenews.com/arc/outboundfeeds/rss/category/air/?outputType=xml";

type Stored = { title: string; link: string; source: string; date?: string; ts: number };

function stripTs(items: Stored[]) {
  return items.map(({ title, link, source, date }) => ({ title, link, source, date }));
}

export async function GET() {
  const ttl = cacheTtl("ops:aviation-news", 15 * 60_000);
  const key = "ops:aviation-news";
  const cached = cacheGet<Stored[]>(key);
  if (cached && cached.age < ttl) {
    return NextResponse.json(
      { items: stripTs(cached.data) },
      { headers: { "X-Panoptes-Health": "live" } },
    );
  }

  try {
    const xml = await fetchText(FEED_URL, {}, 12_000);
    const items = parseRssFeed(xml, "Defense News", undefined, 30);
    if (items.length) cacheSet(key, items);
    return NextResponse.json(
      { items: stripTs(items) },
      { headers: { "X-Panoptes-Health": items.length ? "live" : "degraded" } },
    );
  } catch (e) {
    if (cached) {
      return NextResponse.json(
        { items: stripTs(cached.data) },
        { headers: { "X-Panoptes-Health": "stale" } },
      );
    }
    return NextResponse.json(
      { items: [], error: String(e).slice(0, 120) },
      { headers: { "X-Panoptes-Health": "offline" } },
    );
  }
}
