/**
 * Dedicated marker hues for point layers. Each point layer in layer-registry.ts
 * must use a unique hex (cluster bubbles have no shape — hue is the discriminator).
 *
 * Core tokens mirror PALETTE where possible; extended slots avoid cluster collisions.
 */
export const MARKER_HUES = {
  // Core (shared with theme PALETTE)
  gold: "#ffc700",
  alert: "#ff4b2b",
  intel: "#00d1ff",
  intelSoft: "#a4e6ff",
  friendly: "#00ff41",
  outline: "#859399",
  // Extended marker slots
  orange: "#ff9500",
  rust: "#c2550a",
  brown: "#8b6914",
  violet: "#b08cc9",
  purple: "#9b59b6",
  magenta: "#e84393",
  teal: "#00ccaa",
  deepBlue: "#0066cc",
  ice: "#b9f2ff",
  moss: "#6ab04c",
  amber: "#ff8c00",
  hotPink: "#ff2070",
  // Layer-specific extras (unique cluster hues)
  steelGrey: "#7a7a7a",
  slate: "#708090",
  tan: "#c4a35a",
  portCyan: "#00a8e8",
  skyBlue: "#5eb8ff",
  seaGreen: "#20b2aa",
  goldenrod: "#daa520",
  lightGold: "#ffd54f",
  amberRing: "#ffb300",
  deepRed: "#dc2626",
  coralRed: "#e63946",
  alertOrange: "#ff5533",
  deepPink: "#ff1493",
  limeGreen: "#39ff14",
  aviationGreen: "#00e676",
  crimson: "#ff2200",
  airfieldGold: "#e6b800",
  ember: "#ff5722",
  reliefCyan: "#4db8e8",
} as const;

export type MarkerHueKey = keyof typeof MARKER_HUES;

/** Euclidean RGB distance — validation threshold 100 for same-shape pairs. */
export function markerHueDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Resolve layer color string (MARKER_HUES key path or raw hex) to hex. */
export function resolveMarkerHue(color: string): string {
  if (color.startsWith("#")) return color.toLowerCase();
  const key = color.replace(/^MARKER_HUES\./, "") as MarkerHueKey;
  if (key in MARKER_HUES) return MARKER_HUES[key].toLowerCase();
  return color.toLowerCase();
}
