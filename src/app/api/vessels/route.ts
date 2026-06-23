import type { Feature } from "geojson";
import { serveGeo, feature } from "@/lib/provider";

// Holds a short-lived WebSocket; needs the Node runtime + headroom.
export const runtime = "nodejs";
export const maxDuration = 15;

// AISStream.io — global AIS vessel positions over WebSocket. The key is a
// secret, so we sample server-side: open a WS, collect PositionReports for a
// few seconds, then close and return a GeoJSON snapshot (cached 60s). This
// keeps a stateful streaming source usable from cacheable route handlers.
const KEY = process.env.AIS_STREAM_KEY;
const SAMPLE_MS = 4500;
const MAX_VESSELS = 1500;

interface AisMsg {
  MessageType?: string;
  MetaData?: {
    MMSI?: number;
    ShipName?: string;
    latitude?: number;
    longitude?: number;
    time_utc?: string;
  };
  Message?: {
    PositionReport?: { Sog?: number; Cog?: number; TrueHeading?: number };
  };
}

async function sample(): Promise<Feature[]> {
  if (!KEY) throw new Error("AIS_STREAM_KEY not configured");
  if (typeof WebSocket === "undefined") throw new Error("WebSocket unavailable in runtime");

  return new Promise<Feature[]>((resolve, reject) => {
    const seen = new Map<number, Feature>();
    let settled = false;
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
    const done = () => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* noop */ }
      resolve([...seen.values()]);
    };
    const timer = setTimeout(done, SAMPLE_MS);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          APIKey: KEY,
          BoundingBoxes: [[[-90, -180], [90, 180]]],
          FilterMessageTypes: ["PositionReport"],
        }),
      );
    };
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const data = typeof ev.data === "string" ? ev.data : "";
        if (!data) return;
        const msg = JSON.parse(data) as AisMsg;
        const m = msg.MetaData;
        if (!m || m.latitude == null || m.longitude == null || m.MMSI == null) return;
        const pr = msg.Message?.PositionReport;
        seen.set(
          m.MMSI,
          feature(
            m.longitude,
            m.latitude,
            {
              label: (m.ShipName || `MMSI ${m.MMSI}`).trim(),
              mmsi: m.MMSI,
              sog_kt: pr?.Sog,
              heading: pr?.TrueHeading ?? pr?.Cog ?? 0,
              time: m.time_utc ? Date.parse(m.time_utc) : Date.now(),
            },
            m.MMSI,
          ),
        );
        if (seen.size >= MAX_VESSELS) { clearTimeout(timer); done(); }
      } catch { /* ignore malformed frame */ }
    };
    ws.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("AISStream WS error"));
    };
  });
}

export async function GET() {
  return serveGeo({
    key: "ais-vessels",
    ttlMs: 60_000,
    staleMs: 10 * 60_000,
    load: sample,
  });
}
