/** Data layers exposed in the Tools view left panel (independent from Geospatial toggles). */
export const TOOLS_LAYER_IDS = [
  "country-borders",
  "missile-silos",
  "nuclear-test-sites",
  "military-bases",
  "military-airports",
  "major-ports",
  "power-plants",
  "populated-places",
] as const;

export type ToolsLayerId = (typeof TOOLS_LAYER_IDS)[number];

/** Default on/off state when Tools view loads (Country Borders ON). */
export function defaultToolsLayerState(): Record<string, boolean> {
  return Object.fromEntries(
    TOOLS_LAYER_IDS.map((id) => [id, id === "country-borders"]),
  );
}
