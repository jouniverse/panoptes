import type { Feature, FeatureCollection } from "geojson";
import { fetchJSON } from "@/lib/http";
import { serveGeo, feature } from "@/lib/provider";

// GDELT GKG GeoJSON — media-reported conflict mentions (last ~24h). Free, no key.
// NB: this is MEDIA SIGNAL, not verified events (labelled as such in the UI).
const QUERY = encodeURIComponent(
  "(battle OR airstrike OR shelling OR offensive OR clashes OR bombardment)",
);
const URL = `https://api.gdeltproject.org/api/v1/gkg_geojson?query=${QUERY}&TIMESPAN=1440&maxrows=2000`;

interface GdeltProps {
  name?: string;
  count?: number;
  shareimage?: string;
  html?: string;
  urltone?: number;
}

export async function GET() {
  return serveGeo({
    key: "gdelt-conflict",
    ttlMs: 15 * 60_000,
    load: async () => {
      const fc = await fetchJSON<FeatureCollection>(URL);
      const out: Feature[] = [];
      (fc.features ?? []).forEach((f, i) => {
        const g = f.geometry;
        if (!g || g.type !== "Point") return;
        const [lon, lat] = g.coordinates as number[];
        const p = (f.properties ?? {}) as GdeltProps;
        out.push(
          feature(
            lon,
            lat,
            {
              title: p.name ?? "Media-reported activity",
              mentions: p.count,
              tone: p.urltone,
              sources: p.html,
            },
            `gdelt-${i}`,
          ),
        );
      });
      return out;
    },
  });
}
