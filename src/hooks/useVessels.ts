"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { GeoEntity, FeedHealth } from "@/core/types";
import { useStore } from "@/core/state/store";
import {
  acquireAisConnection,
  aisStatusToHealth,
  getAisUpstreamStatus,
  subscribeAisStatus,
  vesselStore,
  type AisCategory,
  type Vessel,
} from "@/lib/vessel-store";

const MAX_RENDER = 5000;
const STALE_EVICTION_MS = 60_000;

export interface UseVesselsOpts {
  /** Connect to relay and maintain vessel store. */
  enabled?: boolean;
  /** Apply viewport bounding-box filter (Geospatial map). */
  viewport?: { west: number; south: number; east: number; north: number } | null;
}

function inViewport(v: Vessel, vp: NonNullable<UseVesselsOpts["viewport"]>) {
  if (v.lat == null || v.lon == null) return false;
  if (vp.west <= vp.east) {
    return v.lon >= vp.west && v.lon <= vp.east && v.lat >= vp.south && v.lat <= vp.north;
  }
  // Antimeridian wrap
  const lonOk = v.lon >= vp.west || v.lon <= vp.east;
  return lonOk && v.lat >= vp.south && v.lat <= vp.north;
}

function vesselToEntity(v: Vessel): GeoEntity {
  const label = v.watchlistName || v.name || `MMSI ${v.mmsi}`;
  const heading = v.trueHeading != null && v.trueHeading < 360 ? v.trueHeading : (v.cog ?? 0);
  return {
    id: `ais-${v.mmsi}`,
    layerId: "maritime-ais",
    lon: v.lon!,
    lat: v.lat!,
    label,
    properties: {
      label,
      mmsi: v.mmsi,
      name: v.name ?? v.watchlistName,
      sog_kt: v.sog,
      cog: v.cog,
      heading,
      ship_type: v.shipType,
      ais_category: v.aisCategory,
      destination: v.destination,
      nav_status: v.navStatus,
      call_sign: v.callSign,
      imo: v.imoNumber,
      watchlist_country: v.watchlistCountry,
      watchlist_category: v.watchlistCategory,
      time: v.updatedAt,
    },
  };
}

function categoryAllowed(
  cat: AisCategory | undefined,
  showMilitary: boolean,
  showCargoTanker: boolean,
): boolean {
  if (!cat) return false;
  if (cat === "military") return showMilitary;
  return showCargoTanker;
}

/**
 * Live AIS vessel hook — shared by Geospatial map and OPS maritime panel.
 * Connects to the local relay WebSocket when `enabled`; falls back to /api/vessels polling.
 */
export function useVessels(opts: UseVesselsOpts = {}) {
  const { enabled = true, viewport = null } = opts;
  const showMilitary = useStore((s) => s.aisShowMilitary);
  const showCargoTanker = useStore((s) => s.aisShowCargoTanker);

  const storeVersion = useSyncExternalStore(
    vesselStore.subscribe,
    vesselStore.getSnapshot,
    vesselStore.getSnapshot,
  );

  const upstreamStatus = useSyncExternalStore(
    subscribeAisStatus,
    getAisUpstreamStatus,
    () => "idle" as const,
  );

  useEffect(() => {
    if (!enabled) return;
    return acquireAisConnection();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => vesselStore.evictStale(), STALE_EVICTION_MS);
    return () => clearInterval(id);
  }, [enabled]);

  const health: FeedHealth = enabled ? aisStatusToHealth(upstreamStatus) : "idle";

  const vessels = useMemo((): GeoEntity[] => {
    void storeVersion;
    if (!enabled) return [];

    let list = vesselStore
      .getAll()
      .filter(
        (v) =>
          v.lat != null &&
          v.lon != null &&
          categoryAllowed(v.aisCategory, showMilitary, showCargoTanker),
      );

    if (viewport) {
      list = list.filter((v) => inViewport(v, viewport));
    }

    if (list.length > MAX_RENDER) {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      list = list.slice(0, MAX_RENDER);
    }

    return list.map(vesselToEntity);
  }, [enabled, storeVersion, showMilitary, showCargoTanker, viewport]);

  const rawVessels = useMemo((): Vessel[] => {
    void storeVersion;
    if (!enabled) return [];
    return vesselStore
      .getAll()
      .filter(
        (v) =>
          v.lat != null &&
          v.lon != null &&
          categoryAllowed(v.aisCategory, showMilitary, showCargoTanker),
      )
      .sort((a, b) => {
        const rank = (c?: AisCategory) => (c === "military" ? 0 : c === "tanker" ? 1 : 2);
        const d = rank(a.aisCategory) - rank(b.aisCategory);
        if (d !== 0) return d;
        return (b.sog ?? 0) - (a.sog ?? 0);
      });
  }, [enabled, storeVersion, showMilitary, showCargoTanker]);

  return { vessels, rawVessels, health, count: vessels.length, upstreamStatus };
}
