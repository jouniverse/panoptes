export interface CountryIndicators {
  iso: string;
  name: string;
  gpi?: number;
  gpiRank?: number;
  gti?: number;
  gcri?: number;
  fsi?: number;
  ghi?: number;
}

export type IndicatorKey = "gpi" | "gti" | "gcri" | "fsi" | "ghi";

export const INDICATOR_META: Record<
  IndicatorKey,
  { label: string; short: string; domain: [number, number]; hint: string }
> = {
  gpi: { label: "Global Peace Index", short: "GPI", domain: [1, 4], hint: "higher = less peaceful" },
  gti: { label: "Global Terrorism Index", short: "GTI", domain: [0, 9], hint: "higher = more terrorism impact" },
  gcri: { label: "Conflict Risk (GCRI)", short: "GCRI", domain: [0, 10], hint: "higher = more conflict risk" },
  fsi: { label: "Fragile States Index", short: "FSI", domain: [10, 120], hint: "higher = more fragile" },
  ghi: { label: "Global Hunger Index", short: "GHI", domain: [0, 50], hint: "higher = more hunger" },
};
