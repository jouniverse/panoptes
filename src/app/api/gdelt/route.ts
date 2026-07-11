import type { Feature, FeatureCollection } from "geojson";
import { fetchJSON } from "@/lib/http";
import { clusterJitter } from "@/lib/jitter";
import { serveGeo, feature } from "@/lib/provider";

// Tone label bands — keep this inline so the server route does NOT import
// marker-style.ts (a UI/deck.gl module). The same thresholds are mirrored in
// GDELT_TONE_BANDS in marker-style.ts for client-side coloring.
function toneLabel(tone: number): string {
  if (tone < -5) return "Highly negative";
  if (tone < -2) return "Negative";
  if (tone < 2) return "Neutral";
  return "Positive";
}

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
      // GDELT returns ~1.3 MB; the default 12 s timeout races it and opens the
      // circuit breaker. 30 s gives ample headroom for slow responses.
      const fc = await fetchJSON<FeatureCollection>(URL, undefined, 30_000);
      type Raw = {
        srcLon: number;
        srcLat: number;
        props: Record<string, unknown>;
        id: string;
      };
      const raw: Raw[] = [];
      (fc.features ?? []).forEach((f, i) => {
        const g = f.geometry;
        if (!g || g.type !== "Point") return;
        const [lon, lat] = g.coordinates as number[];
        const p = (f.properties ?? {}) as GdeltProps;
        raw.push({
          srcLon: lon,
          srcLat: lat,
          props: {
            title: p.name ?? "Media-reported activity",
            mentions: p.count,
            tone: p.urltone,
            tone_label:
              typeof p.urltone === "number" ? toneLabel(p.urltone) : undefined,
            sources: p.html,
          },
          id: `gdelt-${i}`,
        });
      });

      // GDELT often returns many mentions at the same geocoded point — fan them
      // out on a ring (same clusterJitter as Historical Conflicts / COW MIDLOC).
      const groups = new Map<string, number[]>();
      raw.forEach((r, i) => {
        const key = `${r.srcLon},${r.srcLat}`;
        const g = groups.get(key);
        if (g) g.push(i);
        else groups.set(key, [i]);
      });

      const out: Feature[] = [];
      for (let i = 0; i < raw.length; i++) {
        const r = raw[i];
        const group = groups.get(`${r.srcLon},${r.srcLat}`)!;
        const clusterIndex = group.indexOf(i);
        const clusterSize = group.length;
        const jittered = clusterSize > 1;
        const [lon, lat] = jittered
          ? clusterJitter(r.srcLon, r.srcLat, clusterIndex, clusterSize)
          : [r.srcLon, r.srcLat];
        out.push(
          feature(
            lon,
            lat,
            {
              ...r.props,
              source_longitude: r.srcLon,
              source_latitude: r.srcLat,
              cluster_size: clusterSize,
              jittered,
            },
            r.id,
          ),
        );
      }
      return out;
    },
  });
}
