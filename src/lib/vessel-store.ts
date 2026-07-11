import type { FeedHealth } from "@/core/types";

export type AisCategory = "military" | "cargo" | "tanker";

export interface VesselUpdate {
  mmsi: string;
  lat?: number;
  lon?: number;
  sog?: number;
  cog?: number;
  trueHeading?: number;
  navStatus?: number;
  name?: string;
  destination?: string;
  shipType?: number;
  callSign?: string;
  imoNumber?: number;
  maxDraught?: number;
  messageType?: string;
  updatedAt: number;
  aisCategory?: AisCategory;
  watchlistName?: string;
  watchlistCountry?: string;
  watchlistLabel?: string;
  watchlistCategory?: string;
}

export interface Vessel extends VesselUpdate {
  mmsi: string;
  updatedAt: number;
}

type Listener = () => void;

const STALE_MS = 15 * 60_000;
const DEFAULT_WS = "ws://127.0.0.1:8787/ws";

export class VesselStore {
  private vessels = new Map<string, Vessel>();
  private listeners = new Set<Listener>();
  private _version = 0;

  get version() {
    return this._version;
  }

  get size() {
    return this.vessels.size;
  }

  getAll(): Vessel[] {
    return Array.from(this.vessels.values());
  }

  applyBatch(updates: VesselUpdate[]) {
    for (const u of updates) {
      const prev = this.vessels.get(u.mmsi);
      if (prev) {
        Object.assign(prev, {
          ...(u.lat != null ? { lat: u.lat } : {}),
          ...(u.lon != null ? { lon: u.lon } : {}),
          ...(u.sog != null ? { sog: u.sog } : {}),
          ...(u.cog != null ? { cog: u.cog } : {}),
          ...(u.trueHeading != null ? { trueHeading: u.trueHeading } : {}),
          ...(u.navStatus != null ? { navStatus: u.navStatus } : {}),
          ...(u.name != null ? { name: u.name } : {}),
          ...(u.destination != null ? { destination: u.destination } : {}),
          ...(u.shipType != null ? { shipType: u.shipType } : {}),
          ...(u.callSign != null ? { callSign: u.callSign } : {}),
          ...(u.imoNumber != null ? { imoNumber: u.imoNumber } : {}),
          ...(u.maxDraught != null ? { maxDraught: u.maxDraught } : {}),
          ...(u.messageType ? { messageType: u.messageType } : {}),
          ...(u.aisCategory ? { aisCategory: u.aisCategory } : {}),
          ...(u.watchlistName ? { watchlistName: u.watchlistName } : {}),
          ...(u.watchlistCountry ? { watchlistCountry: u.watchlistCountry } : {}),
          ...(u.watchlistLabel ? { watchlistLabel: u.watchlistLabel } : {}),
          ...(u.watchlistCategory ? { watchlistCategory: u.watchlistCategory } : {}),
          updatedAt: u.updatedAt,
        });
      } else {
        this.vessels.set(u.mmsi, { ...u, mmsi: u.mmsi, updatedAt: u.updatedAt });
      }
    }
    this._version++;
    this.notify();
  }

  clear() {
    this.vessels.clear();
    this._version++;
    this.notify();
  }

  evictStale() {
    const now = Date.now();
    let changed = false;
    for (const [mmsi, v] of this.vessels) {
      if (now - v.updatedAt > STALE_MS) {
        this.vessels.delete(mmsi);
        changed = true;
      }
    }
    if (changed) {
      this._version++;
      this.notify();
    }
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): number => this._version;

  private notify() {
    for (const fn of this.listeners) fn();
  }
}

export const vesselStore = new VesselStore();

type UpstreamStatus = "connected" | "disconnected" | "reconnecting" | "idle" | "degraded" | "offline";

let wsRef: WebSocket | null = null;
let refCount = 0;
let upstreamStatus: UpstreamStatus = "idle";
const statusListeners = new Set<() => void>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let stopped = true;
let fallbackTimer: ReturnType<typeof setInterval> | null = null;
let usingFallback = false;

function setUpstream(status: UpstreamStatus) {
  upstreamStatus = status;
  for (const fn of statusListeners) fn();
}

function getWsUrl() {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_AIS_WS_URL?.trim() || DEFAULT_WS;
  }
  return DEFAULT_WS;
}

async function pollFallback() {
  try {
    const res = await fetch("/api/vessels");
    if (!res.ok) return;
    const fc = (await res.json()) as {
      features?: {
        geometry: { coordinates: [number, number] };
        properties: Record<string, unknown>;
      }[];
    };
    const now = Date.now();
    const updates: VesselUpdate[] = (fc.features ?? []).map((f) => {
      const p = f.properties;
      const mmsi = String(p.mmsi ?? "");
      return {
        mmsi,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        sog: typeof p.sog_kt === "number" ? p.sog_kt : undefined,
        cog: typeof p.cog === "number" ? p.cog : undefined,
        trueHeading: typeof p.heading === "number" ? p.heading : undefined,
        name: typeof p.label === "string" ? p.label : undefined,
        shipType: typeof p.ship_type === "number" ? p.ship_type : undefined,
        aisCategory: p.ais_category as AisCategory | undefined,
        updatedAt: typeof p.time === "number" ? p.time : now,
      };
    });
    vesselStore.applyBatch(updates);
    usingFallback = true;
    setUpstream("degraded");
  } catch {
    setUpstream("offline");
  }
}

function startFallback() {
  if (fallbackTimer) return;
  void pollFallback();
  fallbackTimer = setInterval(() => void pollFallback(), 60_000);
}

function stopFallback() {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
  usingFallback = false;
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  const delay = Math.min(10_000, 400 * 2 ** Math.min(reconnectAttempt, 6));
  reconnectAttempt++;
  setUpstream("reconnecting");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWs();
  }, delay);
}

function connectWs() {
  if (stopped || typeof WebSocket === "undefined") return;
  if (wsRef && wsRef.readyState === WebSocket.OPEN) return;

  const ws = new WebSocket(getWsUrl());
  wsRef = ws;

  ws.onopen = () => {
    reconnectAttempt = 0;
    stopFallback();
    usingFallback = false;
  };

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data as string) as {
        type: string;
        vessels?: VesselUpdate[];
        upstream?: UpstreamStatus;
      };
      if (msg.type === "status" && msg.upstream) {
        setUpstream(msg.upstream);
        return;
      }
      if (msg.type === "batch" && msg.vessels) {
        vesselStore.applyBatch(msg.vessels);
        if (!usingFallback) setUpstream("connected");
      }
    } catch {
      /* ignore */
    }
  };

  ws.onclose = () => {
    wsRef = null;
    if (stopped) return;
    setUpstream("disconnected");
    startFallback();
    scheduleReconnect();
  };

  ws.onerror = () => {
    /* onclose follows */
  };
}

function disconnectWs() {
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  stopFallback();
  const w = wsRef;
  wsRef = null;
  if (w) {
    w.onopen = null;
    w.onmessage = null;
    w.onerror = null;
    w.onclose = null;
    w.close();
  }
  vesselStore.clear();
  setUpstream("idle");
}

export function acquireAisConnection() {
  refCount++;
  if (refCount === 1) {
    stopped = false;
    connectWs();
  }
  return () => {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) disconnectWs();
  };
}

export function subscribeAisStatus(fn: () => void) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export function getAisUpstreamStatus(): UpstreamStatus {
  return upstreamStatus;
}

export function aisStatusToHealth(status: UpstreamStatus): FeedHealth {
  switch (status) {
    case "connected":
      return "live";
    case "reconnecting":
    case "degraded":
      return "degraded";
    case "disconnected":
    case "offline":
      return "offline";
    default:
      return "idle";
  }
}
