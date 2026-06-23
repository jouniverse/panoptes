import type { Feature } from "geojson";
import { fetchJSON } from "@/lib/http";
import { serveGeo, feature } from "@/lib/provider";

// ReliefWeb (OCHA) active disasters. Requires an appname (any identifier).
const APP = process.env.RELIEFWEB_APP_NAME || "panoptes-dev";

interface RWItem {
  fields?: {
    name?: string;
    status?: string;
    date?: { created?: string };
    primary_country?: { name?: string; location?: { lat?: number; lon?: number } };
    type?: { name?: string }[];
    url_alias?: string;
  };
}

export async function GET() {
  return serveGeo({
    key: "reliefweb-disasters",
    ttlMs: 6 * 60 * 60_000,
    load: async () => {
      const url =
        `https://api.reliefweb.int/v1/disasters?appname=${encodeURIComponent(APP)}` +
        `&filter[field]=status&filter[value]=current&limit=200` +
        `&fields[include][]=name&fields[include][]=status&fields[include][]=date.created` +
        `&fields[include][]=primary_country.name&fields[include][]=primary_country.location` +
        `&fields[include][]=type.name&fields[include][]=url_alias`;
      const json = await fetchJSON<{ data?: RWItem[] }>(url);
      const out: Feature[] = [];
      for (const item of json.data ?? []) {
        const f = item.fields;
        const loc = f?.primary_country?.location;
        if (!f || !loc || loc.lat == null || loc.lon == null) continue;
        out.push(
          feature(loc.lon, loc.lat, {
            name: f.name,
            country: f.primary_country?.name,
            type: f.type?.map((t) => t.name).join(", "),
            status: f.status,
            created: f.date?.created,
            url: f.url_alias,
          }),
        );
      }
      return out;
    },
  });
}
