import type { Feature } from "geojson";
import { fetchText } from "@/lib/http";
import { serveGeo, feature } from "@/lib/provider";

// NASA FIRMS VIIRS active fires (last 24h). Needs a free MAP_KEY; without it the
// layer degrades to empty (health=stale) rather than failing the UI.
const MAP_KEY = process.env.FIRMS_MAP_KEY;
const MAX_POINTS = 4000;

export async function GET() {
  return serveGeo({
    key: "firms-fires",
    ttlMs: 15 * 60_000,
    load: async () => {
      if (!MAP_KEY) throw new Error("FIRMS_MAP_KEY not configured");
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${MAP_KEY}/VIIRS_SNPP_NRT/world/1`;
      const csv = await fetchText(url, {}, 15_000);
      const lines = csv.trim().split("\n");
      const header = lines[0].split(",");
      const iLat = header.indexOf("latitude");
      const iLon = header.indexOf("longitude");
      const iFrp = header.indexOf("frp");
      const iConf = header.indexOf("confidence");
      const iDate = header.indexOf("acq_date");
      const iTime = header.indexOf("acq_time");
      const rows: Feature[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split(",");
        const lat = parseFloat(c[iLat]);
        const lon = parseFloat(c[iLon]);
        if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
        const frp = parseFloat(c[iFrp]) || 0;
        rows.push(
          feature(lon, lat, {
            label: `Thermal anomaly · FRP ${frp.toFixed(0)}`,
            frp,
            confidence: c[iConf],
            time: Date.parse(`${c[iDate]}T00:00:00Z`) + (parseInt(c[iTime] || "0", 10) || 0) * 60_000,
          }),
        );
      }
      rows.sort((a, b) => (Number(b.properties?.frp) || 0) - (Number(a.properties?.frp) || 0));
      return rows.slice(0, MAX_POINTS);
    },
  });
}
