// Tactical Futurism palette, mirrored from globals.css @theme for use in
// canvas/WebGL contexts (deck.gl expects [r,g,b] or [r,g,b,a] in 0-255).

export const PALETTE = {
  obsidian: "#0a0c10",
  surface: "#0c0e12",
  surface1: "#111318",
  surface2: "#14171e",
  intel: "#00d1ff",
  intelSoft: "#a4e6ff",
  alert: "#ff4b2b",
  gold: "#ffc700",
  friendly: "#00ff41",
  onSurface: "#e2e2e8",
  onSurfaceVariant: "#bbc9cf",
  outline: "#859399",
  outlineVariant: "#3c494e",
} as const;

export type RGBA = [number, number, number, number];

export function hexToRgba(hex: string, alpha = 255): RGBA {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b, alpha];
}

export const RGB = {
  intel: hexToRgba(PALETTE.intel),
  intelSoft: hexToRgba(PALETTE.intelSoft),
  alert: hexToRgba(PALETTE.alert),
  gold: hexToRgba(PALETTE.gold),
  friendly: hexToRgba(PALETTE.friendly),
  onSurface: hexToRgba(PALETTE.onSurface),
  outline: hexToRgba(PALETTE.outline),
} as const;

export { MARKER_HUES, markerHueDistance, resolveMarkerHue } from "./marker-palette";
