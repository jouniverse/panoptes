import type { Projection } from "@/core/state/store";

/** TextLayer cluster counts — already render correctly on globe. */
export function globeTextLayerProps(isGlobe: boolean): {
  billboard: boolean;
  getPolygonOffset?: () => [number, number];
} {
  if (!isGlobe) return { billboard: true };
  return {
    billboard: true,
    getPolygonOffset: () => [-2, -2],
  };
}

/**
 * IconLayer on GlobeView: deck.gl 9.3 sets cullMode:back on the view, which
 * culls billboard icon quads on the near hemisphere (visgl/deck.gl#9777).
 * depthCompare:always keeps icons above draped tiles; client-side hemisphere
 * culling in useDeckLayers prevents far-side bleed.
 */
export function globeIconLayerProps(isGlobe: boolean): {
  billboard: boolean;
  sizeMinPixels?: number;
  parameters?: {
    cullMode: "none";
    depthCompare: "always";
    depthWriteEnabled: false;
  };
} {
  if (!isGlobe) return { billboard: true };
  return {
    billboard: true,
    sizeMinPixels: 6,
    parameters: {
      cullMode: "none",
      depthCompare: "always",
      depthWriteEnabled: false,
    },
  };
}

export function isGlobeProjection(projection: Projection): boolean {
  return projection === "globe";
}
