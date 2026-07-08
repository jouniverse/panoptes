/// <reference lib="webworker" />
import * as satellite from "satellite.js";

interface Tle {
  name: string;
  line1: string;
  line2: string;
  norad?: number;
}

interface SatPos {
  name: string;
  lat: number;
  lon: number;
  alt: number;
  norad?: number;
}

let recs: { name: string; norad?: number; rec: satellite.SatRec }[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function computeAll(): SatPos[] {
  const now = new Date();
  const gmst = satellite.gstime(now);
  const out: SatPos[] = [];
  for (const { name, norad, rec } of recs) {
    const pv = satellite.propagate(rec, now);
    const pos = pv?.position;
    if (!pos || typeof pos === "boolean") continue;
    const geo = satellite.eciToGeodetic(pos, gmst);
    const lat = satellite.degreesLat(geo.latitude);
    const lon = satellite.degreesLong(geo.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    out.push({ name, lat, lon, alt: geo.height, norad });
  }
  return out;
}

self.onmessage = (e: MessageEvent) => {
  const msg = e.data as { type: string; tles?: Tle[]; intervalMs?: number };
  if (msg.type === "init" && msg.tles) {
    recs = [];
    for (const t of msg.tles) {
      try {
        recs.push({
          name: t.name,
          norad: t.norad,
          rec: satellite.twoline2satrec(t.line1, t.line2),
        });
      } catch {
        /* skip malformed */
      }
    }
    if (timer) clearInterval(timer);
    const interval = msg.intervalMs ?? 1_000;
    const post = () =>
      (self as unknown as Worker).postMessage({ type: "positions", data: computeAll() });
    post();
    timer = setInterval(post, interval);
  } else if (msg.type === "stop" && timer) {
    clearInterval(timer);
    timer = null;
  }
};
