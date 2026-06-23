"use client";

import { useEffect, useRef, useState } from "react";

export interface SatPos {
  name: string;
  lat: number;
  lon: number;
  alt: number;
}

/** Loads a CelesTrak TLE group and propagates positions live in a Web Worker. */
export function useSatellites(group = "stations") {
  const [positions, setPositions] = useState<SatPos[]>([]);
  const [health, setHealth] = useState<"idle" | "live" | "stale">("idle");
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    let cancelled = false;
    const worker = new Worker(new URL("../workers/satellite.worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "positions") setPositions(e.data.data as SatPos[]);
    };

    fetch(`/api/satellites?group=${group}`)
      .then((r) => r.json())
      .then((json: { tles?: unknown[] }) => {
        if (cancelled) return;
        setHealth(json.tles && json.tles.length ? "live" : "stale");
        worker.postMessage({ type: "init", tles: json.tles ?? [] });
      })
      .catch(() => !cancelled && setHealth("stale"));

    return () => {
      cancelled = true;
      worker.terminate();
      workerRef.current = null;
    };
  }, [group]);

  return { positions, health };
}
