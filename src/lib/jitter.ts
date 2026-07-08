/**
 * Spread overlapping point markers in a ring/spiral so stacked features remain
 * clickable. Used for COW MIDLOC clusters and similar datasets.
 */
export function clusterJitter(
  lon: number,
  lat: number,
  index: number,
  count: number,
): [number, number] {
  if (!count || count <= 1) return [lon, lat];

  const perRing = 16;
  const ring = Math.floor(index / perRing);
  const pos = index % perRing;
  const inRing = Math.min(perRing, count - ring * perRing);
  if (inRing <= 0) return [lon, lat];

  const baseR = 0.05;
  const R = baseR + ring * 0.04;
  const ang = (pos / inRing) * Math.PI * 2;
  const plat = lat + R * Math.sin(ang);
  const plon = lon + (R * Math.cos(ang)) / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
  return [plon, plat];
}
