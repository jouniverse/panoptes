export interface CountrySeries {
  milExp: { year: number; value: number }[];
  milExpPctGdp: { year: number; value: number }[];
  battleDeaths: { year: number; value: number }[];
  homicide: { year: number; value: number }[];
  homicideWorld: { year: number; value: number }[];
}

export interface CountryPayload {
  iso: string;
  latest: Record<string, number | undefined>;
  series: CountrySeries;
  macro: Record<string, number | undefined>;
  error?: string;
}

export const EMPTY_COUNTRY_SERIES = (): CountrySeries => ({
  milExp: [],
  milExpPctGdp: [],
  battleDeaths: [],
  homicide: [],
  homicideWorld: [],
});

/** Back-fill missing arrays on cached or partial API payloads. */
export function normalizeCountryPayload(raw: unknown, iso = ""): CountryPayload {
  const r = (raw ?? {}) as Partial<CountryPayload>;
  const s = (r.series ?? {}) as Partial<CountrySeries>;
  return {
    iso: r.iso ?? iso,
    latest: r.latest ?? {},
    series: {
      milExp: s.milExp ?? [],
      milExpPctGdp: s.milExpPctGdp ?? [],
      battleDeaths: s.battleDeaths ?? [],
      homicide: s.homicide ?? [],
      homicideWorld: s.homicideWorld ?? [],
    },
    macro: r.macro ?? {},
    error: r.error,
  };
}
