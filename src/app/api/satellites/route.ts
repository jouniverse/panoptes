import { NextResponse } from "next/server";
import { fetchText } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";

// CelesTrak GP/TLE element sets — free, no auth, redistribution permitted
// (unlike Space-Track, whose ToS forbids exposing bulk TLE to anonymous
// users). We return raw TLE triples; the client propagates them with
// satellite.js in a Web Worker, so positions stay live without re-fetching.
const GROUPS: Record<string, string> = {
  stations: "stations",
  visual: "visual",
  "gps-ops": "gps-ops",
  galileo: "galileo",
  geo: "geo",
  science: "science",
  weather: "weather",
};

interface Tle {
  name: string;
  line1: string;
  line2: string;
}

function parseTle(text: string): Tle[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const out: Tle[] = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (line1?.startsWith("1 ") && line2?.startsWith("2 ")) {
      out.push({ name: name.trim(), line1, line2 });
    }
  }
  return out;
}

export async function GET(req: Request) {
  const group = new URL(req.url).searchParams.get("group") || "stations";
  const slug = GROUPS[group] || "stations";
  const key = `tle:${slug}`;
  const cached = cacheGet<Tle[]>(key);
  if (cached && cached.age < 30 * 60_000) {
    return NextResponse.json({ group: slug, tles: cached.data }, {
      headers: { "X-Panoptes-Health": "live" },
    });
  }
  try {
    const text = await fetchText(
      `https://celestrak.org/NORAD/elements/gp.php?GROUP=${slug}&FORMAT=tle`,
      {},
      12_000,
    );
    const tles = parseTle(text).slice(0, 600);
    cacheSet(key, tles);
    return NextResponse.json({ group: slug, tles }, {
      headers: { "X-Panoptes-Health": "live" },
    });
  } catch (e) {
    if (cached) {
      return NextResponse.json({ group: slug, tles: cached.data }, {
        headers: { "X-Panoptes-Health": "degraded" },
      });
    }
    return NextResponse.json(
      { group: slug, tles: [], error: String(e).slice(0, 120) },
      { headers: { "X-Panoptes-Health": "stale" } },
    );
  }
}
