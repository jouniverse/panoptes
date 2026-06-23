// Nuclear weapon effects — re-implemented from public scaling laws (Glasstone &
// Dolan, "The Effects of Nuclear Weapons", 1977). These are physics equations,
// not code copied from NUKEMAP. All radii are approximations for an optimal
// airburst and intended for analytic visualization, not targeting.

export interface EffectRing {
  id: string;
  label: string;
  radiusKm: number;
  color: string;
  description: string;
}

// Calibrated reference radii at 1 kt (km), scaled by yield as noted below so
// that a 1 Mt airburst reproduces widely-cited figures.
const BLAST_REF = {
  p20: 0.27, // 20 psi — heavy reinforced structures destroyed
  p5: 0.62, // 5 psi — most buildings collapse, widespread fatalities
  p1: 1.7, // 1 psi — windows shatter, light injuries
};
const THERMAL_REF = 0.648; // 3rd-degree burns (~8 cal/cm^2)
const FIREBALL_REF = 0.057; // max fireball radius
const RADIATION_REF = 0.7; // 500 rem prompt ionizing radius (small-yield dominated)

/** Compute the standard effect rings (km) for a given yield in kilotons. */
export function effectRings(yieldKt: number): EffectRing[] {
  const y = Math.max(0.001, yieldKt);
  const cube = Math.cbrt(y);
  const thermal = Math.pow(y, 0.41);
  return [
    {
      id: "fireball",
      label: "Fireball",
      radiusKm: FIREBALL_REF * Math.pow(y, 0.4),
      color: "#ffffff",
      description: "Everything within is vaporized.",
    },
    {
      id: "p20",
      label: "20 psi blast",
      radiusKm: BLAST_REF.p20 * cube,
      color: "#ff4b2b",
      description: "Heavily built concrete buildings destroyed; near-total fatalities.",
    },
    {
      id: "radiation",
      label: "500 rem radiation",
      radiusKm: RADIATION_REF * Math.pow(y, 0.19),
      color: "#00ff41",
      description: "~50–90% mortality from acute radiation (weeks).",
    },
    {
      id: "p5",
      label: "5 psi blast",
      radiusKm: BLAST_REF.p5 * cube,
      color: "#ffc700",
      description: "Most residential/commercial buildings collapse; widespread fatalities.",
    },
    {
      id: "thermal",
      label: "Thermal (3rd-degree burns)",
      radiusKm: THERMAL_REF * thermal,
      color: "#ff8a3d",
      description: "Third-degree burns to exposed skin; ignition of materials.",
    },
    {
      id: "p1",
      label: "1 psi blast",
      radiusKm: BLAST_REF.p1 * cube,
      color: "#00d1ff",
      description: "Window breakage and light injuries out to this radius.",
    },
  ].sort((a, b) => b.radiusKm - a.radiusKm);
}

/** Rough casualty proxy: population inside the 5 psi ring. Caller supplies
 *  population density (people/km^2). */
export function estimateSeverelyAffected(yieldKt: number, popDensity: number): number {
  const r = BLAST_REF.p5 * Math.cbrt(Math.max(0.001, yieldKt));
  return Math.round(Math.PI * r * r * popDensity);
}

/**
 * Simplified downwind fallout footprint (NOT WSEG-10). Produces a teardrop
 * polygon of the given reference dose-rate contour, scaled by yield + wind.
 * Returns [lon,lat] ring suitable for a polygon layer.
 */
export function falloutPolygon(
  lon: number,
  lat: number,
  yieldKt: number,
  windDirDeg: number,
  windKph: number,
  doseLevel: 1 | 10 | 100 | 1000,
): [number, number][] {
  const y = Math.max(0.001, yieldKt);
  // downwind extent (km) grows with yield and wind; shorter for higher dose.
  const doseFactor = { 1: 1, 10: 0.55, 100: 0.28, 1000: 0.12 }[doseLevel];
  const lengthKm = 18 * Math.pow(y / 100, 0.5) * (0.6 + windKph / 40) * doseFactor;
  const widthKm = lengthKm * 0.22;

  // build a teardrop in local km coords, then rotate to wind bearing + project.
  const pts: [number, number][] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0..1 along the plume
    const downwind = t * lengthKm;
    const halfWidth = widthKm * Math.sin(Math.PI * t) * (1 - 0.3 * t);
    pts.push([downwind, halfWidth]);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const downwind = t * lengthKm;
    const halfWidth = widthKm * Math.sin(Math.PI * t) * (1 - 0.3 * t);
    pts.push([downwind, -halfWidth]);
  }

  const bearing = (windDirDeg * Math.PI) / 180;
  const cos = Math.cos(bearing);
  const sin = Math.sin(bearing);
  const kmPerDegLat = 110.574;
  const kmPerDegLon = 111.32 * Math.cos((lat * Math.PI) / 180);

  return pts.map(([dw, cw]) => {
    // rotate (downwind along bearing, crosswind perpendicular)
    const east = dw * sin + cw * cos;
    const north = dw * cos - cw * sin;
    return [lon + east / kmPerDegLon, lat + north / kmPerDegLat] as [number, number];
  });
}
