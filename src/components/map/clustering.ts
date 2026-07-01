import Supercluster from "supercluster";
import type { GeoEntity } from "@/core/types";

export interface ClusterPoint {
  // common
  lon: number;
  lat: number;
  isCluster: boolean;
  // cluster
  clusterId?: number;
  count?: number;
  // leaf
  entity?: GeoEntity;
}

interface Indexed {
  sc: Supercluster;
  signature: string;
}

const cache = new Map<string, Indexed>();

/** Threshold above which a point layer is clustered for readability. */
export const CLUSTER_THRESHOLD = 400;

function buildIndex(layerId: string, entities: GeoEntity[]): Supercluster {
  const signature = `${entities.length}`;
  const hit = cache.get(layerId);
  if (hit && hit.signature === signature) return hit.sc;

  const sc = new Supercluster({ radius: 48, maxZoom: 12, minPoints: 4 });
  sc.load(
    entities.map((e, i) => ({
      type: "Feature" as const,
      properties: { i },
      geometry: { type: "Point" as const, coordinates: [e.lon, e.lat] },
    })),
  );
  cache.set(layerId, { sc, signature });
  return sc;
}

export function clusterPoints(
  layerId: string,
  entities: GeoEntity[],
  zoom: number,
): ClusterPoint[] {
  const sc = buildIndex(layerId, entities);
  const clusters = sc.getClusters([-180, -85, 180, 85], Math.floor(zoom));
  return clusters.map((c) => {
    const [lon, lat] = c.geometry.coordinates;
    const props = c.properties as { cluster?: boolean; cluster_id?: number; point_count?: number; i?: number };
    if (props.cluster) {
      return {
        lon,
        lat,
        isCluster: true,
        clusterId: props.cluster_id,
        count: props.point_count,
      };
    }
    return { lon, lat, isCluster: false, entity: entities[props.i as number] };
  });
}

export function clusterExpansionZoom(layerId: string, clusterId: number): number {
  const hit = cache.get(layerId);
  if (!hit) return 4;
  try {
    return hit.sc.getClusterExpansionZoom(clusterId);
  } catch {
    return 4;
  }
}

/**
 * Returns the entity-array indices for all leaves in a cluster.
 * Used to aggregate per-entity properties (e.g. avg tone) at cluster level.
 */
export function getClusterLeafIndices(layerId: string, clusterId: number): number[] {
  const hit = cache.get(layerId);
  if (!hit) return [];
  try {
    return hit.sc
      .getLeaves(clusterId, Infinity)
      .map((f) => (f.properties as { i: number }).i);
  } catch {
    return [];
  }
}
