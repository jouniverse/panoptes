import type { Feature, FeatureCollection } from "geojson";
import { fetchJSON } from "@/lib/http";
import { serveGeo, feature } from "@/lib/provider";

// USGS Earthquake Hazards Program — M2.5+ last 24h. Free, no key, public domain.
const URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson";

export async function GET() {
  return serveGeo({
    key: "earthquakes",
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
