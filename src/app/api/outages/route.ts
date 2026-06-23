import type { Feature } from "geojson";
import { fetchJSON } from "@/lib/http";
import { serveGeo, feature } from "@/lib/provider";
import centroids from "@/data/country-centroids.json";

// Cloudflare Radar — internet outages/anomalies. Needs a Cloudflare API token;
// without it the layer degrades to empty. Outages are country-coded, so we
// place each at the country centroid.
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CENTROIDS = centroids as Record<string, { lon: number; lat: number; name: string }>;

interface Outage {
  locations?: string[];
  asns?: number[];
  startDate?: string;
  endDate?: string;
  description?: string;
  eventType?: string;
  linkedUrl?: string;
}

export async function GET() {
  return serveGeo({
    key: "cf-outages",
    ttlMs: 30 * 60_000,
    load: async () => {
      if (!TOKEN) throw new Error("CLOUDFLARE_API_TOKEN not configured");
      const url =
        "https://api.cloudflare.com/client/v4/radar/annotations/outages?limit=50&dateRange=7d&format=json";
      const json = await fetchJSON<{ result?: { annotations?: Outage[] } }>(url, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const out: Feature[] = [];
      (json.result?.annotations ?? []).forEach((o, i) => {
        const iso = o.locations?.[0];
        const c = iso ? CENTROIDS[iso] : undefined;
        if (!c) return;
        out.push(
          feature(
            c.lon,
            c.lat,
            {
              label: `${o.eventType ?? "OUTAGE"} · ${c.name}`,
              description: o.description,
              eventType: o.eventType,
              start: o.startDate,
              end: o.endDate,
              asns: o.asns?.join(", "),
              time: o.startDate ? Date.parse(o.startDate) : undefined,
              url: o.linkedUrl,
            },
            `cf-${i}`,
          ),
        );
      });
      return out;
    },
  });
}
