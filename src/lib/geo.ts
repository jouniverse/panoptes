import type {
  Feature,
  FeatureCollection,
  Geometry,
  Position,
} from "geojson";
import type { GeoEntity, SourceTier } from "@/core/types";

/** Rough representative point for any geometry (centroid-ish, cheap). */
export function representativePoint(geom: Geometry): [number, number] | null {
  switch (geom.type) {
    case "Point":
      return [geom.coordinates[0], geom.coordinates[1]];
    case "MultiPoint":
    case "LineString":
      return avg(geom.coordinates as Position[]);
    case "MultiLineString":
    case "Polygon":
      return avg(flat(geom.coordinates as Position[][]));
    case "MultiPolygon":
      return avg(flat(flat(geom.coordinates as Position[][][])));
    case "GeometryCollection":
      for (const g of geom.geometries) {
        const p = representativePoint(g);
        if (p) return p;
      }
      return null;
    default:
      return null;
  }
}

function flat<T>(arr: T[][]): T[] {
  return ([] as T[]).concat(...arr);
}

function avg(coords: Position[]): [number, number] | null {
  if (!coords.length) return null;
  let x = 0;
  let y = 0;
  for (const c of coords) {
    x += c[0];
    y += c[1];
  }
  return [x / coords.length, y / coords.length];
}

export interface EntityFieldMap {
  /** property key used for the hover label, with fallbacks tried in order. */
  label: string[];
  /** optional property -> sourceTier. */
  tier?: (p: Record<string, unknown>) => SourceTier;
  /** optional property -> severity 0..1. */
  severity?: (p: Record<string, unknown>) => number | undefined;
  /** optional property -> epoch ms. */
  timestamp?: (p: Record<string, unknown>) => number | undefined;
}

/** Convert a normalized GeoJSON FeatureCollection into GeoEntity[]. */
export function geojsonToEntities(
  fc: FeatureCollection,
  layerId: string,
  fields: EntityFieldMap,
): GeoEntity[] {
  const out: GeoEntity[] = [];
  fc.features.forEach((f: Feature, i) => {
    if (!f.geometry) return;
    const point = representativePoint(f.geometry);
    if (!point) return;
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const label =
      fields.label.map((k) => props[k]).find((v) => v != null && v !== "") ??
      `${layerId}-${i}`;
    out.push({
      id: String(f.id ?? props.id ?? `${layerId}-${i}`),
      layerId,
      lon: point[0],
      lat: point[1],
      geometry: f.geometry,
      label: String(label),
      properties: props,
      sourceTier: fields.tier?.(props),
      severity: fields.severity?.(props),
      timestamp: fields.timestamp?.(props),
    });
  });
  return out;
}

export function isLineOrPolygon(geom?: Geometry): boolean {
  if (!geom) return false;
  return (
    geom.type === "LineString" ||
    geom.type === "MultiLineString" ||
    geom.type === "Polygon" ||
    geom.type === "MultiPolygon"
  );
}
