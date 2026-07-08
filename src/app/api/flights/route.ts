import type { Feature } from "geojson";
import { fetchJSON } from "@/lib/http";
import { isMilitaryHex, lookupMilitary } from "@/lib/military-hex";
import { getOpenSkyToken } from "@/lib/opensky";
import { serveGeo, feature } from "@/lib/provider";

const ADSB_URL = "https://api.adsb.lol/v2/mil";
const OPENSKY_URL = "https://opensky-network.org/api/states/all";

interface AdsbAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  gs?: number;
  track?: number;
}

/** OpenSky state vector — see https://openskynetwork.github.io/opensky-api/rest.html */
type OpenSkyState = [
  string, // 0 icao24
  string | null, // 1 callsign
  string, // 2 origin_country
  number | null, // 3 time_position
  number, // 4 last_contact
  number | null, // 5 longitude
  number | null, // 6 latitude
  number | null, // 7 baro_altitude
  boolean, // 8 on_ground
  number | null, // 9 velocity m/s
  number | null, // 10 true_track
  ...unknown[],
];

function normalizeAdsb(a: AdsbAircraft, now: number): Feature | null {
  if (a.lat == null || a.lon == null || !a.hex) return null;
  const callsign = (a.flight ?? "").trim();
  const mil = lookupMilitary(a.hex);
  return feature(
    a.lon,
    a.lat,
    {
      callsign: callsign || a.hex,
      registration: a.r ?? mil?.registration,
      type: a.t ?? mil?.type,
      altitude: a.alt_baro,
      speed_kt: a.gs,
      heading: a.track ?? 0,
      hex: a.hex,
      source: "adsb.lol",
      operator: mil?.operator,
      owner: mil?.owner,
      operator_country: mil?.country,
      military_reason: mil?.reason,
      time: now,
    },
    a.hex,
  );
}

function normalizeOpenSky(s: OpenSkyState, now: number): Feature | null {
  const hex = s[0];
  const lon = s[5];
  const lat = s[6];
  if (lon == null || lat == null || !hex) return null;
  const callsign = (s[1] ?? "").trim();
  const mil = lookupMilitary(hex);
  const velMs = s[9];
  return feature(
    lon,
    lat,
    {
      callsign: callsign || hex,
      type: mil?.type,
      registration: mil?.registration,
      altitude: s[7] != null ? Math.round(s[7] * 3.28084) : undefined, // m → ft
      speed_kt: velMs != null ? Math.round(velMs * 1.94384) : undefined,
      heading: s[10] ?? 0,
      hex,
      origin_country: s[2],
      on_ground: s[8],
      source: "opensky",
      operator: mil?.operator,
      owner: mil?.owner,
      operator_country: mil?.country ?? s[2],
      military_reason: mil?.reason,
      time: (s[3] ?? s[4]) * 1000 || now,
    },
    hex,
  );
}

async function fetchOpenSkyMilitary(): Promise<Feature[]> {
  const token = await getOpenSkyToken();
  if (!token) return [];

  const json = await fetchJSON<{ states?: OpenSkyState[] | null }>(
    OPENSKY_URL,
    { headers: { Authorization: `Bearer ${token}` } },
    12_000,
  );

  const now = Date.now();
  const out: Feature[] = [];
  for (const s of json.states ?? []) {
    if (!s?.[0] || !isMilitaryHex(s[0])) continue;
    const f = normalizeOpenSky(s, now);
    if (f) out.push(f);
  }
  return out;
}

export async function GET() {
  return serveGeo({
    key: "mil-flights",
    ttlMs: 30_000,
    staleMs: 5 * 60_000,
    load: async () => {
      const now = Date.now();
      const [adsbRes, openskyRes] = await Promise.allSettled([
        fetchJSON<{ ac?: AdsbAircraft[] }>(ADSB_URL, {}, 9000),
        fetchOpenSkyMilitary(),
      ]);

      const byHex = new Map<string, Feature>();

      if (adsbRes.status === "fulfilled") {
        for (const a of adsbRes.value.ac ?? []) {
          const f = normalizeAdsb(a, now);
          if (f?.id) byHex.set(String(f.id), f);
        }
      }

      if (openskyRes.status === "fulfilled") {
        for (const f of openskyRes.value) {
          const id = String(f.id ?? f.properties?.hex);
          if (!id || byHex.has(id)) continue;
          byHex.set(id, f);
        }
      }

      const merged = [...byHex.values()];
      if (merged.length === 0 && adsbRes.status === "rejected" && openskyRes.status === "rejected") {
        throw adsbRes.reason ?? openskyRes.reason;
      }
      return merged;
    },
  });
}
