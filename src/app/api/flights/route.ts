import type { Feature } from "geojson";
import { fetchJSON } from "@/lib/http";
import { serveGeo, feature } from "@/lib/provider";

// adsb.lol — global military ADS-B. Free, no key. "Best free, no-auth mil API."
const URL = "https://api.adsb.lol/v2/mil";

interface Aircraft {
  hex?: string;
  flight?: string;
  r?: string; // registration
  t?: string; // type
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  gs?: number; // ground speed (kt)
  track?: number; // heading deg
}

export async function GET() {
  return serveGeo({
    key: "mil-flights",
    ttlMs: 30_000,
    staleMs: 5 * 60_000,
    load: async () => {
      const json = await fetchJSON<{ ac?: Aircraft[] }>(URL, {}, 9000);
      const now = Date.now();
      const out: Feature[] = [];
      for (const a of json.ac ?? []) {
        if (a.lat == null || a.lon == null) continue;
        out.push(
          feature(
            a.lon,
            a.lat,
            {
              callsign: (a.flight ?? a.hex ?? "").trim() || a.hex,
              registration: a.r,
              type: a.t,
              altitude: a.alt_baro,
              speed_kt: a.gs,
              heading: a.track ?? 0,
              hex: a.hex,
              time: now,
            },
            a.hex,
          ),
        );
      }
      return out;
    },
  });
}
