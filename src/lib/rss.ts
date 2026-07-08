export interface RssItem {
  title: string;
  link: string;
  source: string;
  perspective?: string;
  date?: string;
  ts: number;
}

export function cleanXml(s: string): string {
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
  return m ? cleanXml(m[1]) : undefined;
}

export function parseRssFeed(
  xml: string,
  source: string,
  perspective?: string,
  perFeed = 12,
): RssItem[] {
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/gi) ?? [];
  const items: RssItem[] = [];
  for (const b of blocks.slice(0, perFeed)) {
    const title = tag(b, "title");
    if (!title) continue;
    let link = tag(b, "link");
    if (!link) {
      const m = b.match(/<link[^>]*href="([^"]+)"/i);
      link = m?.[1];
    }
    const date = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated");
    const ts = date ? Date.parse(date) : Date.now();
    items.push({
      title,
      link: link || "",
      source,
      perspective,
      date,
      ts: Number.isNaN(ts) ? Date.now() : ts,
    });
  }
  return items;
}
