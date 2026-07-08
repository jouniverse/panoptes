import { NextResponse } from "next/server";
import { fetchJSON } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";

const AWC = "https://aviationweather.gov/api/data";
const TTL_MS = 10 * 60_000;

export interface Sigmet {
  kind: "isigmet" | "sigmet";
  icaoId?: string;
  firId?: string;
  firName?: string;
  hazard?: string;
  qualifier?: string;
  rawText?: string;
  validTimeFrom?: number;
  validTimeTo?: number;
  coords: Coord[];
}

interface Coord {
  lon: number;
  lat: number;
}

/** Start of current UTC hour — AWC date param (YYYYMMDDHHmm). */
function hourDateParam(): string {
  const now = new Date();
  return now.toISOString().slice(0, 13).replace(/[-T]/g, "") + "00";
}

/** AWC returns coords as {lon,lat} objects (isigmet) or {lat,lon} (airsigmet). */
function normalizeCoords(raw: unknown): Coord[] {
  if (!Array.isArray(raw)) return [];
  const out: Coord[] = [];
  for (const c of raw) {
    if (Array.isArray(c) && c.length >= 2) {
      out.push({ lon: Number(c[0]), lat: Number(c[1]) });
    } else if (c && typeof c === "object") {
      const o = c as Record<string, unknown>;
      if (o.lon != null && o.lat != null) {
        out.push({ lon: Number(o.lon), lat: Number(o.lat) });
      } else if (o.lng != null && o.lat != null) {
        out.push({ lon: Number(o.lng), lat: Number(o.lat) });
      }
    }
  }
  return out.filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
}

function pointInRing(lon: number, lat: number, ring: Coord[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const { lon: xi, lat: yi } = ring[i];
    const { lon: xj, lat: yj } = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function affectsAirport(
  sig: Sigmet,
  icao: string,
  lon?: number,
  lat?: number,
): boolean {
  if (sig.icaoId?.toUpperCase() === icao) return true;
  if (lon != null && lat != null && sig.coords.length >= 3) {
    return pointInRing(lon, lat, sig.coords);
  }
  return false;
}

function normalizeIsigmet(raw: Record<string, unknown>): Sigmet {
  return {
    kind: "isigmet",
    icaoId: raw.icaoId as string | undefined,
    firId: raw.firId as string | undefined,
    firName: raw.firName as string | undefined,
    hazard: raw.hazard as string | undefined,
    qualifier: raw.qualifier as string | undefined,
    rawText: (raw.rawSigmet ?? raw.rawAirSigmet) as string | undefined,
    validTimeFrom: raw.validTimeFrom as number | undefined,
    validTimeTo: raw.validTimeTo as number | undefined,
    coords: normalizeCoords(raw.coords),
  };
}

function normalizeAirsigmet(raw: Record<string, unknown>): Sigmet {
  return {
    kind: "sigmet",
    icaoId: raw.icaoId as string | undefined,
    hazard: raw.hazard as string | undefined,
    qualifier: raw.qualifier as string | undefined,
    rawText: raw.rawAirSigmet as string | undefined,
    validTimeFrom: raw.validTimeFrom as number | undefined,
    validTimeTo: raw.validTimeTo as number | undefined,
    coords: normalizeCoords(raw.coords),
  };
}

function parseList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const nested = o.features ?? o.data;
    if (Array.isArray(nested)) return nested as Record<string, unknown>[];
  }
  return [];
}

async function fetchIsigmets(): Promise<Sigmet[]> {
  const cacheKey = "awc:isigmet";
  const cached = cacheGet<Sigmet[]>(cacheKey);
  if (cached && cached.age < TTL_MS) return cached.data;

  const date = hourDateParam();
  const url = `${AWC}/isigmet?format=json&date=${date}`;
  const raw = await fetchJSON<unknown>(url, {}, 15_000);
  const sigmets = parseList(raw).map(normalizeIsigmet);
  cacheSet(cacheKey, sigmets);
  return sigmets;
}

async function fetchUsSigmets(): Promise<Sigmet[]> {
  const cacheKey = "awc:airsigmet";
  const cached = cacheGet<Sigmet[]>(cacheKey);
  if (cached && cached.age < TTL_MS) return cached.data;

  const url = `${AWC}/airsigmet?format=json&types=sigmet`;
  const raw = await fetchJSON<unknown>(url, {}, 15_000);
  const sigmets = parseList(raw).map(normalizeAirsigmet);
  cacheSet(cacheKey, sigmets);
  return sigmets;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const icao = params.get("icao")?.trim().toUpperCase();
  const country = params.get("country")?.trim().toUpperCase();
  const lon = params.get("lon") ? parseFloat(params.get("lon")!) : undefined;
  const lat = params.get("lat") ? parseFloat(params.get("lat")!) : undefined;

  if (!icao || !/^[A-Z0-9]{3,4}$/.test(icao)) {
    return NextResponse.json({ error: "icao query param required" }, { status: 400 });
  }

  try {
    const us = country === "US";
    const all = us ? await fetchUsSigmets() : await fetchIsigmets();
    const sigmets = all.filter((s) => affectsAirport(s, icao, lon, lat));
    return NextResponse.json(
      { icao, country, kind: us ? "sigmet" : "isigmet", sigmets },
      { headers: { "Cache-Control": "public, max-age=600" } },
    );
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 120) }, { status: 502 });
  }
}

/** @deprecated use Sigmet */
export type Isigmet = Sigmet;
