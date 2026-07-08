/** Server-side cache TTLs for infrequently changing API sources (plan §1.3). */
export const CACHE_TTL_MS: Record<string, number> = {
  "world-bank:country": 30 * 24 * 3_600_000,
  "world-bank:macro": 30 * 24 * 3_600_000,
  "data360:bulk": 30 * 24 * 3_600_000,
  "bis:macro": 24 * 3_600_000,
  "world-bank:battle-deaths": 30 * 24 * 3_600_000,
  "world-bank:homicide": 30 * 24 * 3_600_000,
  "hdx:hapi:conflicts": 24 * 3_600_000,
  "worldfactbook:country": 30 * 24 * 3_600_000,
  "tle:gov-military": 24 * 60 * 60_000,
  "ops:naval-news": 15 * 60_000,
  "ops:aviation-news": 15 * 60_000,
  "ops:space-news": 15 * 60_000,
  "ops:space-weather": 60 * 60_000,
  "ops:yahoo": 5 * 60_000,
  "ops:eia": 7 * 24 * 60 * 60_000,
  "ops:fred": 24 * 60 * 60_000,
  "ops:gscpi": 24 * 60 * 60_000,
  "ops:comtrade-live": 24 * 60 * 60_000,
  "ops:trade-bundle": 24 * 60 * 60_000,
};

export function cacheTtl(key: string, fallbackMs = 24 * 3_600_000): number {
  return CACHE_TTL_MS[key] ?? fallbackMs;
}
