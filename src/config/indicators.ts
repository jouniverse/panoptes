export interface CountryIndicators {
  iso: string;
  name: string;
  cinc?: number;
  aci?: number;
  gpi?: number;
  gpiRank?: number;
  fsi?: number;
  gti?: number;
  corpi?: number;
  gci?: number;
  hdi?: number;
  ssi?: number;
  ghi?: number;
}

/** Left-rail toggle order — grouped: capability → conflict/peace → governance → humanitarian */
export type IndicatorKey =
  | "cinc"
  | "aci"
  | "gpi"
  | "fsi"
  | "gti"
  | "corpi"
  | "gci"
  | "hdi"
  | "ssi"
  | "ghi";

export interface IndicatorMeta {
  label: string;
  short: string;
  domain: [number, number];
  hint: string;
  /** When true, higher values are desirable (inverts choropleth / table color ramp). */
  higherIsBetter?: boolean;
  /** When true, rank list shows highest values first. */
  rankHigherFirst?: boolean;
}

export const INDICATOR_META: Record<IndicatorKey, IndicatorMeta> = {
  cinc: {
    label: "Composite Index of National Capability",
    short: "CINC",
    domain: [0, 0.2],
    hint: "higher = greater material capability",
    rankHigherFirst: true,
  },
  aci: {
    label: "ACLED Conflict Index",
    short: "ACI",
    domain: [1, 156],
    hint: "higher rank = less conflict",
    higherIsBetter: true,
    rankHigherFirst: false,
  },
  gpi: {
    label: "Global Peace Index",
    short: "GPI",
    domain: [1, 4],
    hint: "higher = less peaceful",
    rankHigherFirst: true,
  },
  fsi: {
    label: "Fragile States Index",
    short: "FSI",
    domain: [10, 120],
    hint: "higher = more fragile",
    rankHigherFirst: true,
  },
  gti: {
    label: "Global Terrorism Index",
    short: "GTI",
    domain: [0, 9],
    hint: "higher = more terrorism impact",
    rankHigherFirst: true,
  },
  ssi: {
    label: "Safety & Security Index",
    short: "SSI",
    domain: [1, 7],
    hint: "higher = safer (WEF TTDI)",
    higherIsBetter: true,
    rankHigherFirst: false,
  },
  corpi: {
    label: "Corruption Perceptions Index",
    short: "CorPI",
    domain: [0, 100],
    hint: "higher = less corrupt",
    higherIsBetter: true,
    rankHigherFirst: false,
  },
  gci: {
    label: "Global Cybersecurity Index",
    short: "GCI",
    domain: [0, 100],
    hint: "higher = stronger cyber posture",
    higherIsBetter: true,
    rankHigherFirst: false,
  },
  hdi: {
    label: "Human Development Index",
    short: "HDI",
    domain: [0, 1],
    hint: "higher = better development",
    higherIsBetter: true,
    rankHigherFirst: false,
  },
  ghi: {
    label: "Global Hunger Index",
    short: "GHI",
    domain: [0, 50],
    hint: "higher = more hunger",
    rankHigherFirst: true,
  },
};

export const INDICATOR_ORDER: IndicatorKey[] = [
  "cinc",
  "aci",
  "gpi",
  "fsi",
  "gti",
  "ssi",
  "corpi",
  "gci",
  "hdi",
  "ghi",
];
