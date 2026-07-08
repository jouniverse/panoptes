import { INDICATOR_META, type IndicatorKey } from "@/config/indicators";
import type { RGBA } from "@/config/theme";

/** Choropleth ramp — intel (low) → gold → alert (high). */
export function indexRamp(t: number): RGBA {
  const c = Math.max(0, Math.min(1, t));
  if (c < 0.5) {
    const k = c / 0.5;
    return [Math.round(k * 255), Math.round(209 - k * 10), Math.round(255 - k * 255), 255];
  }
  const k = (c - 0.5) / 0.5;
  return [255, Math.round(199 - k * 124), Math.round(k * 43), 255];
}

/** 0 = good (blue), 1 = bad (red). Inverts when higher values are desirable. */
export function riskT(key: IndicatorKey, value: number): number {
  const [min, max] = INDICATOR_META[key].domain;
  let t = (value - min) / (max - min || 1);
  if (INDICATOR_META[key].higherIsBetter) t = 1 - t;
  return Math.max(0, Math.min(1, t));
}

/** Normalized fill/stroke color for an index value within its domain. */
export function colorForIndex(key: IndicatorKey, value: number | undefined | null): string | undefined {
  if (value == null) return undefined;
  const [r, g, b] = indexRamp(riskT(key, value));
  return `rgb(${r},${g},${b})`;
}
