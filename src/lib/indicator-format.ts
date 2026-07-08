import type { IndicatorKey } from "@/config/indicators";
import { fixed } from "@/lib/format";

/** Display formatter for index values in lists, tooltips, and tables. */
export function formatIndicatorValue(key: IndicatorKey, value: number | undefined | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (key === "cinc") return (value * 100).toFixed(3);
  if (key === "aci") return String(Math.round(value));
  return fixed(value, 2);
}
