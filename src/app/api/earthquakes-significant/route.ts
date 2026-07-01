import type { Feature, FeatureCollection } from "geojson";
import { fetchJSON } from "@/lib/http";
import { serveGeo, feature } from "@/lib/provider";

// USGS significant earthquakes, last 7 days. Free, no key, public domain.
// Overlay to the main Earthquakes layer — few, high-impact events.
const URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson";

export async function GET() {
  return serveGeo({
    key: "earthquakes-significant",
    ttlMs: 60 * 60_000,
    load: async () => {
      const fc = await fetchJSON<FeatureCollection>(URL);
      const out: Feature[] = [];
      for (const f of fc.features) {
        const g = f.geometry;
        if (!g || g.type !== "Point") continue;
        const [lon, lat, depth] = g.coordinates as number[];
        const p = (f.properties ?? {}) as Record<string, unknown>;
        out.push(
          feature(
            lon,
            lat,
            {
              label: `M${p.mag ?? "?"} · ${p.place ?? "unknown"}`,
              mag: p.mag,
              place: p.place,
              depth_km: depth,
              time: p.time,
              url: p.url,
              tsunami: p.tsunami,
            },
            String(f.id),
          ),
        );
      }
      return out;
    },
  });
}
