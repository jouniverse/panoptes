import { NextResponse } from "next/server";
import { fetchJSON } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";

// NGA Maritime Safety Information — broadcast navigational warnings. Free,
// no key. Many warnings are text-only (no geometry); this powers the Ops
// "Maritime Alerts" feed.
interface NgaWarn {
  msgYear?: number;
  msgNumber?: number;
  navArea?: string;
  subregion?: string;
  text?: string;
  status?: string;
  issueDate?: string;
}

export async function GET() {
  const key = "nga-warnings";
  const cached = cacheGet<NgaWarn[]>(key);
  if (cached && cached.age < 30 * 60_000) {
    return NextResponse.json({ warnings: cached.data }, { headers: { "X-Panoptes-Health": "live" } });
  }
  try {
    const json = await fetchJSON<{ "broadcast-warn"?: NgaWarn[] }>(
      "https://msi.nga.mil/api/publications/broadcast-warn?status=active&output=json",
      {},
      12_000,
    );
    const warnings = (json["broadcast-warn"] ?? []).slice(0, 120).map((w) => ({
      id: `${w.navArea}-${w.msgYear}-${w.msgNumber}`,
      navArea: w.navArea,
      subregion: w.subregion,
      text: (w.text || "").slice(0, 600),
      issueDate: w.issueDate,
      status: w.status,
    }));
    cacheSet(key, warnings);
    return NextResponse.json({ warnings }, { headers: { "X-Panoptes-Health": "live" } });
  } catch (e) {
    if (cached) return NextResponse.json({ warnings: cached.data }, { headers: { "X-Panoptes-Health": "degraded" } });
    return NextResponse.json(
      { warnings: [], error: String(e).slice(0, 120) },
      { headers: { "X-Panoptes-Health": "stale" } },
    );
  }
}
