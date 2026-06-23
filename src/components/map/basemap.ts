import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";

/**
 * Free, token-less dark raster basemap (CARTO dark_nolabels). Renders in both
 * MapView and GlobeView. A self-hosted Protomaps PMTiles vector basemap can be
 * substituted later (see NEXT_PUBLIC_BASEMAP_PMTILES_URL) via an MVTLayer.
 */
const CARTO_DARK = "https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png";

export function basemapLayer() {
  return new TileLayer({
    id: "basemap-carto-dark",
    data: CARTO_DARK,
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    maxCacheSize: 300,
    renderSubLayers: (props) => {
      const tile = props.tile as unknown as {
        boundingBox: [[number, number], [number, number]];
      };
      const [[west, south], [east, north]] = tile.boundingBox;
      return new BitmapLayer({
        id: `${props.id}-bitmap`,
        image: props.data as unknown as string,
        bounds: [west, south, east, north],
        tintColor: [120, 150, 165],
        opacity: 0.85,
      });
    },
  });
}
