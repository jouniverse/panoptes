import { NextResponse } from "next/server";
import { fetchText } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";

// Multi-perspective RSS aggregation. Pulling several state/independent outlets
// side-by-side surfaces narrative divergence — a deliberate OSINT technique,
// not an endorsement of any source.
export const maxDuration = 25;

const FEEDS = [
  { source: "BBC", perspective: "UK", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { source: "Al Jazeera", perspective: "QA", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { source: "France 24", perspective: "FR", url: "https://www.france24.com/en/rss" },
  { source: "TASS", perspective: "RU", url: "https://tass.com/rss/v2.xml" },
  { source: "Global Times", perspective: "CN", url: "https://www.globaltimes.cn/rss/outbrain.xml" },
  { source: "Times of India", perspective: "IN", url: "https://timesofindia.indiatimes.com/rssfeedstopstories.cms" },
];

interface NewsItem {
  title: string;
  link: string;
  source: string;
  perspective: string;
  date?: string;
  ts: number;
}

function clean(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? clean(m[1]) : undefined;
}

function parseFeed(xml: string, source: string, perspective: string): NewsItem[] {
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
  const items: NewsItem[] = [];
  for (const b of blocks.slice(0, 12)) {
    const title = tag(b, "title");
    if (!title) continue;
    let link = tag(b, "link");
    if (!link) {
      const m = b.match(/<link[^>]*href="([^"]+)"/i);
      link = m?.[1];
    }
    const date = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated");
    const ts = date ? Date.parse(date) : Date.now();
    items.push({ title, link: link || "", source, perspective, date, ts: Number.isNaN(ts) ? Date.now() : ts });
  }
  return items;
}

export async function GET() {
  const key = "news";
  const cached = cacheGet<NewsItem[]>(key);
  if (cached && cached.age < 10 * 60_000) {
    return NextResponse.json({ items: cached.data }, { headers: { "X-Panoptes-Health": "live" } });
  }
  const results = await Promise.allSettled(
    FEEDS.map(async (f) => parseFeed(await fetchText(f.url, {}, 8000), f.source, f.perspective)),
  );
  const items = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 80);
  const live = results.filter((r) => r.status === "fulfilled").length;
  if (items.length) cacheSet(key, items);
  const health = live === FEEDS.length ? "live" : live > 0 ? "degraded" : "stale";
  return NextResponse.json({ items }, { headers: { "X-Panoptes-Health": health } });
}
