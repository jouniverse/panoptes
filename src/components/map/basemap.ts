import { TileLayer } from "@deck.gl/geo-layers";
import { BitmapLayer } from "@deck.gl/layers";
import type { BasemapStyle } from "@/core/state/store";

/**
 * Free, token-less raster basemaps. Renders in both MapView and GlobeView.
 * Strategic = CARTO dark (tactical default). Satellite = Esri World Imagery.
 */
const CARTO_DARK = "https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png";
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const BASEMAP_CONFIG: Record<
  BasemapStyle,
  { id: string; url: string; tintColor?: [number, number, number]; opacity: number }
> = {
  strategic: {
    id: "basemap-strategic",
    url: CARTO_DARK,
    tintColor: [120, 150, 165],
    opacity: 0.85,
  },
  satellite: {
    id: "basemap-satellite",
    url: ESRI_IMAGERY,
    opacity: 1,
  },
};

export function basemapLayer(style: BasemapStyle = "strategic", isGlobe = false) {
  const cfg = BASEMAP_CONFIG[style];
  const opacity = isGlobe ? 1 : cfg.opacity;
  return new TileLayer({
    id: cfg.id,
    data: cfg.url,
    minZoom: 0,
    maxZoom: style === "satellite" ? 18 : 19,
    tileSize: 256,
    maxCacheSize: 300,
    renderSubLayers: (props) => {
      const tile = props.tile as unknown as {
        boundingBox?: [[number, number], [number, number]];
      };
      // Guard: in some view/tiling states (notably GlobeView) boundingBox can be
      // momentarily undefined. Destructuring it then throws "reading '0'", which
      // breaks deck.gl's render loop and leaves both globe and map uninteractive.
      const bbox = tile?.boundingBox;
      if (!bbox) return null;
      const [[west, south], [east, north]] = bbox;
      return new BitmapLayer({
        id: `${props.id}-bitmap`,
        image: props.data as unknown as string,
        bounds: [west, south, east, north],
        ...(cfg.tintColor ? { tintColor: cfg.tintColor } : {}),
        opacity,
        ...(isGlobe
          ? {
              parameters: {
                depthWriteEnabled: true,
                depthCompare: "less-equal" as const,
              },
            }
          : {}),
      });
    },
  });
}
