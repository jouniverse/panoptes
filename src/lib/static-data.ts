import { readFileSync } from "node:fs";
import { join } from "node:path";

const mem = new Map<string, unknown>();

/** Load and memoize a JSON file from public/data/. */
export function loadPublicData<T>(filename: string): T {
  if (!mem.has(filename)) {
    const p = join(process.cwd(), "public/data", filename);
    mem.set(filename, JSON.parse(readFileSync(p, "utf8")));
  }
  return mem.get(filename) as T;
}

export interface BattleDeathsFile {
  tracked: string[];
  countries: Record<string, { year: number; value: number }[]>;
}

export interface HomicidesFile {
  byCode: Record<string, { year: number; value: number }[]>;
  world: { year: number; value: number }[];
}

export interface ImfBopEntry {
  valueMillions: number;
  valueUsd: number;
  year: number;
  scale: string;
  unit: string;
}

export interface IsoMapsFile {
  iso3to2: Record<string, string>;
  bis: Record<string, { cbpr: string | null; credit: string | null; reer: string | null }>;
}

export function battleDeathsFor(iso: string): {
  tracked: boolean;
  series: { year: number; value: number }[];
} {
  const data = loadPublicData<BattleDeathsFile>("battle-deaths.json");
  const tracked = data.tracked.includes(iso);
  return { tracked, series: tracked ? (data.countries[iso] ?? []) : [] };
}

export function homicidesFor(iso: string): {
  country: { year: number; value: number }[];
  world: { year: number; value: number }[];
} {
  const data = loadPublicData<HomicidesFile>("homicides.json");
  return { country: data.byCode[iso] ?? [], world: data.world ?? [] };
}

export function imfBopFor(iso: string): ImfBopEntry | undefined {
  const data = loadPublicData<Record<string, ImfBopEntry>>("imf-bop.json");
  return data[iso];
}

export function isoMaps(): IsoMapsFile {
  return loadPublicData<IsoMapsFile>("iso-maps.json");
}
