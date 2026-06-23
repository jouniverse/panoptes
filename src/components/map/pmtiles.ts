import { MVTLayer } from "@deck.gl/geo-layers";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import { PMTiles } from "pmtiles";
import { parse } from "@loaders.gl/core";
import { MVTLoader } from "@loaders.gl/mvt";
import type { Feature } from "geojson";
import { hexToRgba } from "@/config/theme";
import type { LayerDefinition } from "@/core/types";

// One PMTiles archive instance per URL. Tracks "missing" archives so a layer
// whose tiles haven't been built yet degrades silently instead of spamming
// per-tile 404s.
interface ArchiveState {
  pmtiles: PMTiles;
  ok: boolean | null; // null = unknown, false = missing/unreadable
}
const archives = new Map<string, ArchiveState>();

function getArchive(url: string): ArchiveState {
  let a = archives.get(url);
  if (!a) {
    a = { pmtiles: new PMTiles(url), ok: null };
    archives.set(url, a);
    a.pmtiles
      .getHeader()
      .then(() => (a!.ok = true))
      .catch(() => (a!.ok = false));
  }
  return a;
}

/**
 * On-demand Tier B layer: reads MVT tiles directly from a static PMTiles
 * archive (range requests) and renders them with deck.gl. Only fetches tiles
 * at/above the layer's minZoom, so huge datasets never load all at once.
 */
export function pmtilesLayer(def: LayerDefinition): Layer {
  const url = def.source.ref;
  const color = hexToRgba(def.color);
  const isLine = def.kind === "line";

  return new MVTLayer({
    id: `layer-${def.id}`,
    data: url,
    minZoom: def.minZoom ?? 0,
    maxZoom: 14,
    binary: false,
    getTileData: async (tile): Promise<Feature[]> => {
      const a = getArchive(url);
      if (a.ok === false) return [];
      const { x, y, z } = tile.index;
      try {
        const range = await a.pmtiles.getZxy(z, x, y);
        if (!range) return [];
        const features = (await parse(range.data, MVTLoader, {
          mvt: {
            coordinates: "wgs84",
            tileIndex: { x, y, z },
          },
          worker: false,
        })) as Feature[];
        return features;
      } catch {
        return [];
      }
    },
    renderSubLayers: (props) =>
      new GeoJsonLayer(props, {
        stroked: true,
        filled: def.kind === "polygon",
        pointType: "circle",
        getLineColor: color,
        getFillColor: [color[0], color[1], color[2], 22],
        getPointRadius: 3,
        pointRadiusUnits: "pixels",
        lineWidthMinPixels: isLine ? 0.7 : 0.5,
        lineWidthMaxPixels: 3,
      }) as unknown as Layer,
  }) as unknown as Layer;
}
