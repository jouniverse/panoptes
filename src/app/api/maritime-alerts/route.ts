import type { Feature } from "geojson";
import { fetchText } from "@/lib/http";
import { serveGeo, feature } from "@/lib/provider";

/**
 * NGA Maritime Safety Information — in-force navigational warnings.
 *
 * IMPORTANT: the structured `broadcast-warn?output=json` endpoint only serves
 * ARCHIVED warnings (2021–2024) and must not be used. The live, in-force data
 * lives in the "DailyMem" text bulletins (one per NAVAREA / HYDRO area, from the
 * Panoptes Postman collection). We fetch all five and parse the plain text.
 *
 * Each bulletin is a header ("... IN FORCE AS OF DDHHMMZ MON YY") followed by
 * blank-line-separated warning blocks:
 *
 *   282002Z JUN 26            <- issue datetime
 *   NAVAREA IV 636/26.        <- message ref
 *   NORTH ATLANTIC.           <- region lines
 *   CANADA.
 *   1. ... 46-53.00N 054-05.00W ...   <- body w/ DMS positions
 *   2. CANCEL THIS MSG ...
 */
const BASE = "https://msi.nga.mil/api/publications/download?type=view&key=16694640/SFH00000";
const AREAS: { area: string; file: string }[] = [
  { area: "NAVAREA IV", file: "DailyMemIV.txt" },
  { area: "NAVAREA XII", file: "DailyMemXII.txt" },
  { area: "HYDROLANT", file: "DailyMemLAN.txt" },
  { area: "HYDROPAC", file: "DailyMemPAC.txt" },
  { area: "HYDROARC", file: "DailyMemARC.txt" },
];

// Handles both "19-23.0N 092-03.1W" (deg-decimalMin) and
// "18-42-17N 095-11-18W" (deg-min-sec).
const DMS =
  /(\d{1,3})-(\d{1,2}(?:\.\d+)?)(?:-(\d{1,2}(?:\.\d+)?))?\s*([NS])\s+(\d{1,3})-(\d{1,2}(?:\.\d+)?)(?:-(\d{1,2}(?:\.\d+)?))?\s*([EW])/;
const REF = /^([A-Z]+(?:\s+[IVXLC]+)?)\s+(\d+)\/(\d+)\b/;

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function toDeg(d: string, m: string, s: string | undefined, hemi: string): number {
  const v = parseInt(d, 10) + parseFloat(m) / 60 + (s ? parseFloat(s) / 3600 : 0);
  return hemi === "S" || hemi === "W" ? -v : v;
}

function firstPosition(text: string): [number, number] | null {
  const m = text.match(DMS);
  if (!m) return null;
  const lat = toDeg(m[1], m[2], m[3], m[4]);
  const lon = toDeg(m[5], m[6], m[7], m[8]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}

/** "282002Z JUN 26" (or 4-digit year) -> epoch ms (UTC). */
function parseIssue(line: string): number | undefined {
  const m = line.match(/^(\d{2})(\d{2})(\d{2})Z\s+([A-Z]{3})\s+(\d{2,4})/);
  if (!m) return undefined;
  const mon = MONTHS[m[4]];
  if (mon == null) return undefined;
  let year = +m[5];
  if (year < 100) year += 2000;
  return Date.UTC(year, mon, +m[1], +m[2], +m[3]);
}

interface ParsedWarn {
  area: string;
  ref: string;
  region: string | undefined;
  issued: string;
  time: number | undefined;
  lon: number;
  lat: number;
  text: string;
}

function parseBulletin(area: string, body: string): ParsedWarn[] {
  const out: ParsedWarn[] = [];
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const time = parseIssue(lines[0]);
    if (time == null) continue; // header / boilerplate, not a warning
    const pos = firstPosition(block);
    if (!pos) continue; // positionless notice

    const refIdx = lines.findIndex((l) => REF.test(l));
    const refLine = refIdx >= 0 ? lines[refIdx] : `${area}`;
    const ref = refLine.replace(/\.$/, "");

    // Region = lines between the ref and the first numbered item.
    let region: string | undefined;
    if (refIdx >= 0) {
      const regionLines: string[] = [];
      for (let i = refIdx + 1; i < lines.length; i++) {
        if (/^\d+\./.test(lines[i])) break;
        regionLines.push(lines[i].replace(/\.$/, ""));
      }
      region = regionLines.join(", ") || undefined;
    }

    out.push({
      area,
      ref,
      region,
      issued: lines[0],
      time,
      lon: pos[0],
      lat: pos[1],
      text: block.trim().slice(0, 700),
    });
  }
  return out;
}

export async function GET() {
  return serveGeo({
    key: "maritime-alerts",
    ttlMs: 6 * 60 * 60_000, // NGA refreshes a few times daily
    load: async () => {
      const results = await Promise.allSettled(
        AREAS.map((a) => fetchText(`${BASE}/${a.file}`).then((t) => parseBulletin(a.area, t))),
      );
      const warns = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      // If every area failed, surface an error so the circuit breaker / stale
      // logic engages instead of caching an empty result as "live".
      if (warns.length === 0) {
        throw new Error("NGA MSI: all DailyMem bulletins empty or unreachable");
      }
      return warns.map<Feature>((w) =>
        feature(
          w.lon,
          w.lat,
          {
            label: w.ref,
            region: w.region,
            nav_area: w.area,
            issued: w.issued,
            time: w.time,
            text: w.text,
          },
          `msi-${w.ref.replace(/\s+/g, "-")}`,
        ),
      );
    },
  });
}
