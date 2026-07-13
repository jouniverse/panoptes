import { fieldMapFor } from "@/config/field-maps";
import type { GeoEntity } from "@/core/types";

/** Extra property keys searched beyond normalized `label` / `id`. */
export const SEARCH_EXTRA_KEYS: Partial<Record<string, string[]>> = {
  "military-flights": ["hex", "icao", "registration", "flight", "squawk"],
  "maritime-ais": ["mmsi", "call_sign", "imo", "watchlistName", "destination"],
  satellites: ["norad"],
  "military-airports": ["icao_code", "ident", "iata_code"],
  "populated-places": ["NAME", "nameascii", "adm0name"],
  "major-ports": ["PORT_NAME", "COUNTRY"],
  "critical-minerals": ["DEPOSIT_NAME", "LOCATION_NAME", "COUNTRY"],
  "mineral-deposits": ["DEP_NAME", "COUNTRY"],
  "military-bases": ["nearest_city", "country"],
  disasters: ["event_type", "country"],
  earthquakes: ["place", "mag"],
  "earthquakes-major": ["place", "mag"],
  "conflict-events": ["domain", "sourcecountry"],
};

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_RESULTS = 20;

export interface LayerSearchHit {
  entity: GeoEntity;
  layerId: string;
  layerName: string;
  matchField: string;
  matchValue: string;
}

export function searchKeysFor(layerId: string): string[] {
  const fm = fieldMapFor(layerId);
  const extras = SEARCH_EXTRA_KEYS[layerId] ?? [];
  return [...new Set([...fm.label, "label", "name", "title", ...extras])];
}

function entityMatches(entity: GeoEntity, keys: string[], q: string): LayerSearchHit | null {
  const label = entity.label?.trim();
  if (label && label.toLowerCase().includes(q)) {
    return { entity, layerId: entity.layerId, layerName: "", matchField: "label", matchValue: label };
  }

  const id = String(entity.id ?? "");
  if (id && id.toLowerCase().includes(q)) {
    return { entity, layerId: entity.layerId, layerName: "", matchField: "id", matchValue: id };
  }

  for (const key of keys) {
    const raw = entity.properties[key];
    if (raw == null || raw === "") continue;
    const value = String(raw);
    if (value.toLowerCase().includes(q)) {
      return { entity, layerId: entity.layerId, layerName: "", matchField: key, matchValue: value };
    }
  }

  return null;
}

export function searchEnabledLayers(
  data: Record<string, { entities: GeoEntity[] }>,
  enabled: Record<string, boolean>,
  layerNames: Record<string, string>,
  query: string,
): LayerSearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < SEARCH_MIN_CHARS) return [];

  const hits: LayerSearchHit[] = [];

  for (const [layerId, layerData] of Object.entries(data)) {
    if (!enabled[layerId]) continue;
    const keys = searchKeysFor(layerId);
    const layerName = layerNames[layerId] ?? layerId;

    for (const entity of layerData.entities) {
      const match = entityMatches(entity, keys, q);
      if (!match) continue;
      hits.push({ ...match, layerName });
      if (hits.length >= SEARCH_MAX_RESULTS) return hits;
    }
  }

  return hits;
}

/** Zoom level when flying to a search result. */
export function flyZoomForEntity(entity: GeoEntity, currentZoom: number): number {
  if (entity.layerId === "satellites") return Math.max(currentZoom, 2.5);
  if (entity.layerId === "military-flights") return Math.max(currentZoom, 6);
  return Math.min(12, Math.max(currentZoom, 7));
}
