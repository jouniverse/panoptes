import type { Feature } from "geojson";
import { serveGeo, feature } from "@/lib/provider";
import { classifyVesselUpdate } from "@/lib/ais-classify";

// Holds a short-lived WebSocket; needs the Node runtime + headroom.
export const runtime = "nodejs";
export const maxDuration = 15;

// AISStream.io — degraded snapshot when the local relay is unavailable.
const KEY = process.env.AIS_STREAM_KEY;
const SAMPLE_MS = 4500;
const MAX_VESSELS = 1500;

async function loadParser() {
  const mod = await import("../../../../scripts/ais-relay/aisParser.mjs");
  return mod.normalizeAisMessage as (raw: unknown) => Record<string, unknown> | null;
}

async function sample(): Promise<Feature[]> {
  if (!KEY) throw new Error("AIS_STREAM_KEY not configured");
  if (typeof WebSocket === "undefined") throw new Error("WebSocket unavailable in runtime");

  const normalizeAisMessage = await loadParser();

  return new Promise<Feature[]>((resolve, reject) => {
    const seen = new Map<string, Feature>();
    let settled = false;
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
    const done = () => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* noop */
      }
      resolve([...seen.values()]);
    };
    const timer = setTimeout(done, SAMPLE_MS);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          Apikey: KEY,
          BoundingBoxes: [[[-90, -180], [90, 180]]],
        }),
      );
    };

    ws.onmessage = (ev: MessageEvent) => {
      try {
        const data = typeof ev.data === "string" ? ev.data : "";
        if (!data) return;
        const raw = JSON.parse(data) as unknown;
        const normalized = normalizeAisMessage(raw);
        if (!normalized) return;

        const classified = classifyVesselUpdate({
          ...normalized,
          updatedAt: Date.now(),
        });
        if (!classified) return;

        const heading =
          classified.trueHeading != null && classified.trueHeading < 360
            ? classified.trueHeading
            : (classified.cog ?? 0);

        seen.set(
          classified.mmsi,
          feature(
            classified.lon,
            classified.lat,
            {
              label: (classified.watchlistName || classified.name || `MMSI ${classified.mmsi}`).trim(),
              mmsi: classified.mmsi,
              sog_kt: classified.sog,
              cog: classified.cog,
              heading,
              ship_type: classified.shipType,
              ais_category: classified.aisCategory,
              time: Date.now(),
            },
            classified.mmsi,
          ),
        );
        if (seen.size >= MAX_VESSELS) {
          clearTimeout(timer);
          done();
        }
      } catch {
        /* ignore malformed frame */
      }
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
