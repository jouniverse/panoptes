import type { Feature } from "geojson";
import { fetchJSON } from "@/lib/http";
import { serveGeo, feature } from "@/lib/provider";

// ReliefWeb (OCHA) active disasters. `appname` is effectively an API key: it
// must be a valid registered identifier (see https://apidoc.reliefweb.int/).
// A made-up fallback like "panoptes-dev" is rejected, so we require the env var.
const APP = process.env.RELIEFWEB_APP_NAME;

interface RWCountry {
  name?: string;
  iso3?: string;
  location?: { lat?: number; lon?: number };
}

interface RWItem {
  id?: string;
  fields?: {
    name?: string;
    status?: string;
    date?: { created?: string };
    primary_country?: RWCountry;
    type?: { name?: string }[];
    url_alias?: string;
  };
}

export async function GET() {
  return serveGeo({
    key: "reliefweb-disasters",
    ttlMs: 6 * 60 * 60_000,
    load: async () => {
      if (!APP) throw new Error("RELIEFWEB_APP_NAME not configured");
      // v1 was decommissioned (HTTP 410) — use v2. Follow the Postman convention:
      // fetch the N most recent disasters ordered by date desc (no status filter),
      // which surfaces the latest events (e.g. the Jun-2026 Venezuela earthquake).
      // v2 only accepts top-level field names, so request the whole
      // `primary_country` object and read `.location.{lat,lon}` from it.
      const url =
        `https://api.reliefweb.int/v2/disasters?appname=${encodeURIComponent(APP)}` +
        `&limit=100&sort[]=date:desc` +
        `&fields[include][]=name&fields[include][]=status&fields[include][]=date` +
        `&fields[include][]=primary_country&fields[include][]=type&fields[include][]=url_alias`;
      const json = await fetchJSON<{ data?: RWItem[] }>(url);

      // ReliefWeb only geolocates a disaster to its COUNTRY centroid, so several
      // disasters in one country land on the exact same point and only one marker
      // is visible. Instead of dropping events, fan each country's events out on a
      // small deterministic ring around the centroid so all are visible/clickable.
      type Valid = { item: RWItem; f: NonNullable<RWItem["fields"]>; lat: number; lon: number; key: string };
      const valid: Valid[] = [];
      for (const item of json.data ?? []) {
        const f = item.fields;
        const loc = f?.primary_country?.location;
        if (!f || loc?.lat == null || loc?.lon == null) continue;
        const key = f.primary_country?.iso3 ?? f.primary_country?.name ?? `${loc.lat},${loc.lon}`;
        valid.push({ item, f, lat: loc.lat, lon: loc.lon, key });
      }
      const counts = new Map<string, number>();
      for (const v of valid) counts.set(v.key, (counts.get(v.key) ?? 0) + 1);

      const idx = new Map<string, number>();
      const out: Feature[] = [];
      for (const { item, f, lat, lon, key } of valid) {
        const n = counts.get(key) ?? 1;
        const i = idx.get(key) ?? 0;
        idx.set(key, i + 1);
        let plat = lat;
        let plon = lon;
        if (n > 1) {
          const R = 0.7; // degrees — small spread around the centroid
          const ang = (i / n) * Math.PI * 2;
          plat = lat + R * Math.sin(ang);
          plon = lon + (R * Math.cos(ang)) / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
        }
        out.push(
          feature(
            plon,
            plat,
            {
              name: f.name,
              country: f.primary_country?.name,
              type: f.type?.map((t) => t.name).join(", "),
              status: f.status,
              created: f.date?.created,
              // v2 url_alias is already an absolute reliefweb.int URL.
              url:
                f.url_alias ??
                (item.id ? `https://reliefweb.int/disaster/${item.id}` : undefined),
            },
            item.id ? `rw-${item.id}` : undefined,
          ),
        );
      }
      return out;
    },
  });
}
