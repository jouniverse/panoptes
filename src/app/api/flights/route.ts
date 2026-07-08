import { serveGeo } from "@/lib/provider";
import { loadMilitaryFlights } from "@/lib/military-flights";

/** Live military ADS-B — IntelSky + adsb.lol (merged), registry-enriched, OpenSky gap-fill.
 *  Shared by Geospatial military-flights layer and OPS Aviation panel. */
export async function GET() {
  return serveGeo({
    key: "mil-flights",
    ttlMs: 30_000,
    staleMs: 5 * 60_000,
    load: async () => {
      const { features } = await loadMilitaryFlights();
      return features;
    },
  });
}
