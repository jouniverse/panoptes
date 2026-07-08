import { NextResponse } from "next/server";
import { fetchText } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";
import { cacheTtl } from "@/config/cache-schedule";
import { parseRssFeed } from "@/lib/rss";

export const maxDuration = 25;

const FEEDS = [
  { source: "USNI Fleet Tracker", url: "https://news.usni.org/category/fleet-tracker/feed" },
  { source: "USNI News", url: "https://news.usni.org/feed" },
  { source: "Naval News", url: "https://www.navalnews.com/feed/" },
  { source: "HI Sutton", url: "https://www.hisutton.com/feed.xml" },
  { source: "Naval Today", url: "https://navaltoday.com/feed/" },
  {
    source: "USNI Western Pacific Pulse",
    url: "https://news.usni.org/category/news/western-pacific-pulse/feed",
  },
];

type Stored = { title: string; link: string; source: string; date?: string; ts: number };

function stripTs(items: Stored[]) {
  return items.map(({ title, link, source, date }) => ({ title, link, source, date }));
}

export async function GET() {
  const ttl = cacheTtl("ops:naval-news", 15 * 60_000);
  const key = "ops:naval-news";
  const cached = cacheGet<Stored[]>(key);
  if (cached && cached.age < ttl) {
    return NextResponse.json(
      { items: stripTs(cached.data) },
      { headers: { "X-Panoptes-Health": "live" } },
    );
  }

  const results = await Promise.allSettled(
    FEEDS.map(async (f) => parseRssFeed(await fetchText(f.url, {}, 12_000), f.source)),
  );
  const merged = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 60);

  const live = results.filter((r) => r.status === "fulfilled" && r.value.length > 0).length;
  if (merged.length) cacheSet(key, merged);
  const health = live === FEEDS.length ? "live" : live > 0 ? "degraded" : cached ? "stale" : "offline";
  if (!merged.length && cached) {
    return NextResponse.json(
      { items: stripTs(cached.data) },
      { headers: { "X-Panoptes-Health": "stale" } },
    );
  }
  return NextResponse.json(
    { items: stripTs(merged) },
    { headers: { "X-Panoptes-Health": health } },
  );
}
