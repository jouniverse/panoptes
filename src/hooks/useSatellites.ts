"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedHealth } from "@/core/types";

export interface SatPos {
  name: string;
  lat: number;
  lon: number;
  alt: number;
  norad?: number;
}

interface TlePayload {
  tles?: { name: string; line1: string; line2: string; norad?: number }[];
}

function mapHealth(header: string | null, hasData: boolean): FeedHealth {
  if (!hasData) return "stale";
  if (header === "live") return "live";
  if (header === "degraded") return "degraded";
  if (header === "offline") return "offline";
  return "stale";
}

async function loadTleGroup(group: string): Promise<{ tles: TlePayload["tles"]; health: FeedHealth }> {
  try {
    const r = await fetch(`/api/satellites?group=${group}`);
    const json = (await r.json()) as TlePayload;
    const health = mapHealth(r.headers.get("X-Panoptes-Health"), !!(json.tles && json.tles.length));
    if (json.tles?.length) return { tles: json.tles, health };
  } catch {
    /* fall through to static bundle */
  }

  if (group === "gov-military") {
    try {
      const r = await fetch("/data/gov-military-tles.json");
      if (r.ok) {
        const json = (await r.json()) as TlePayload & { fetchedAt?: string };
        if (json.tles?.length) {
          const ageMs = json.fetchedAt ? Date.now() - Date.parse(json.fetchedAt) : 0;
          const health: FeedHealth =
            ageMs < 24 * 60 * 60_000 ? "live" : ageMs < 7 * 24 * 60 * 60_000 ? "degraded" : "stale";
          return { tles: json.tles, health };
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { tles: [], health: "stale" };
}

/**
 * Loads TLEs from /api/satellites and propagates positions in a Web Worker.
 * Gov/mil group uses Space-Track (cached in public/data/gov-military-tles.json).
 * Shared by Geospatial map layer and OPS Space // Orbital panel.
 */
export function useSatellites(group = "stations", enabled = true) {
  const [positions, setPositions] = useState<SatPos[]>([]);
  const [health, setHealth] = useState<FeedHealth>("idle");
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (!enabled) {
      setPositions([]);
      setHealth("idle");
      return;
    }

    let cancelled = false;
    const worker = new Worker(
      new URL("../workers/satellite.worker.ts", import.meta.url),
    );
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "positions") setPositions(e.data.data as SatPos[]);
    };

    setHealth("idle");
    loadTleGroup(group)
      .then(({ tles, health: h }) => {
        if (cancelled) return;
        setHealth(h);
        worker.postMessage({ type: "init", tles: tles ?? [], intervalMs: 30_000 });
      })
      .catch(() => !cancelled && setHealth("stale"));

    return () => {
      cancelled = true;
      worker.terminate();
      workerRef.current = null;
    };
  }, [group, enabled]);

  return { positions, health };
}
