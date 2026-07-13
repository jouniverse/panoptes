import type { GeoEntity } from "@/core/types";

type Listener = () => void;

/** In-memory index of live worker-layer entities for layer search (satellites, AIS). */
class LiveSearchIndex {
  private byLayer = new Map<string, GeoEntity[]>();
  private listeners = new Set<Listener>();
  private version = 0;

  getVersion = () => this.version;

  get(layerId: string): GeoEntity[] {
    return this.byLayer.get(layerId) ?? [];
  }

  set(layerId: string, entities: GeoEntity[]) {
    this.byLayer.set(layerId, entities);
    this.version += 1;
    this.listeners.forEach((fn) => fn());
  }

  clear(layerId: string) {
    if (!this.byLayer.has(layerId)) return;
    this.byLayer.delete(layerId);
    this.version += 1;
    this.listeners.forEach((fn) => fn());
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
}

export const liveSearchIndex = new LiveSearchIndex();
