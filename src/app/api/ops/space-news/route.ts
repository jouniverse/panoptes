import { NextResponse } from "next/server";
import { fetchJSON, fetchText } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";
import { cacheTtl } from "@/config/cache-schedule";
import { parseRssFeed } from "@/lib/rss";
import { normalizeSpaceLaunch } from "@/lib/space-launches";

export const maxDuration = 30;

const RSS_URL =
  "https://www.defensenews.com/arc/outboundfeeds/rss/category/space/?outputType=xml";
const LAUNCHES_URL =
  "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?format=json&limit=15";

type Stored = {
  news: { title: string; link: string; source: string; date?: string }[];
  launches: ReturnType<typeof normalizeSpaceLaunch>[];
};

export async function GET() {
  const ttl = cacheTtl("ops:space-news", 15 * 60_000);
  const key = "ops:space-news";
  const cached = cacheGet<Stored>(key);
  if (cached && cached.age < ttl) {
    return NextResponse.json(cached.data, { headers: { "X-Panoptes-Health": "live" } });
  }

  const [rssResult, launchesResult] = await Promise.allSettled([
    fetchText(RSS_URL, {}, 12_000).then((xml) =>
      parseRssFeed(xml, "Defense News", undefined, 20).map(({ title, link, source, date }) => ({
        title,
        link,
        source,
        date,
      })),
    ),
    fetchJSON<{ results?: Parameters<typeof normalizeSpaceLaunch>[0][] }>(LAUNCHES_URL, {}, 15_000).then(
      (j) => (j.results ?? []).map(normalizeSpaceLaunch),
    ),
  ]);

  const news = rssResult.status === "fulfilled" ? rssResult.value : cached?.data.news ?? [];
  const launches =
    launchesResult.status === "fulfilled" ? launchesResult.value : cached?.data.launches ?? [];

  const liveParts =
    (rssResult.status === "fulfilled" ? 1 : 0) + (launchesResult.status === "fulfilled" ? 1 : 0);
  const health =
    liveParts === 2 ? "live" : liveParts === 1 ? "degraded" : cached ? "stale" : "offline";

  if (news.length || launches.length) {
    cacheSet(key, { news, launches });
  }

  if (!news.length && !launches.length && cached) {
    return NextResponse.json(cached.data, { headers: { "X-Panoptes-Health": "stale" } });
  }

  return NextResponse.json({ news, launches }, { headers: { "X-Panoptes-Health": health } });
}
