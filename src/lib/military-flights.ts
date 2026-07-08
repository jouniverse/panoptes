import type { Feature } from "geojson";
import { fetchJSON } from "@/lib/http";
import { isMilitaryHex, lookupMilitary } from "@/lib/military-hex";
import { getOpenSkyToken } from "@/lib/opensky";
import { feature } from "@/lib/provider";

const ADSB_URL = "https://api.adsb.lol/v2/mil";
const INTELSKY_URL = "https://intelsky.org/api/";
const OPENSKY_URL = "https://opensky-network.org/api/states/all";

export interface LiveContact {
  hex: string;
  lat: number;
  lon: number;
  callsign?: string;
  registration?: string;
  type?: string;
  description?: string;
  operator?: string;
  operatorCountry?: string;
  altitude?: number | string;
  speedKt?: number;
  heading?: number;
  squawk?: string;
  onGround?: boolean;
  time: number;
  feeds: Set<string>;
}

interface AdsbAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  gs?: number;
  track?: number;
}

interface IntelSkyAircraft {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  desc?: string;
  ownOp?: string;
  dbFlags?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number;
  gs?: number;
  track?: number;
  squawk?: string;
}

/** OpenSky state vector — see https://openskynetwork.github.io/opensky-api/rest.html */
type OpenSkyState = [
  string,
  string | null,
  string,
  number | null,
  number,
  number | null,
  number | null,
  number | null,
  boolean,
  number | null,
  number | null,
  ...unknown[],
];

function normHex(hex: string): string {
  return hex.toLowerCase().trim().padStart(6, "0").slice(-6);
}

function str(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function pickStr(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) {
    if (v) return v;
  }
  return undefined;
}

function adsbToContact(a: AdsbAircraft, now: number): LiveContact | null {
  if (a.lat == null || a.lon == null || !a.hex) return null;
  return {
    hex: normHex(a.hex),
    lat: a.lat,
    lon: a.lon,
    callsign: str(a.flight),
    registration: str(a.r),
    type: str(a.t),
    altitude: a.alt_baro,
    speedKt: a.gs,
    heading: a.track ?? 0,
    time: now,
    feeds: new Set(["adsb.lol"]),
  };
}

function intelskyToContact(a: IntelSkyAircraft, now: number): LiveContact | null {
  if (a.lat == null || a.lon == null || !a.hex) return null;
  // IntelSky marks military/gov via ownOp and/or dbFlags (country flag emoji)
  if (!str(a.ownOp) && !str(a.dbFlags)) return null;
  return {
    hex: normHex(a.hex),
    lat: a.lat,
    lon: a.lon,
    callsign: str(a.flight),
    registration: str(a.r),
    type: str(a.t),
    description: str(a.desc),
    operator: str(a.ownOp),
    altitude: a.alt_baro,
    speedKt: a.gs,
    heading: a.track ?? 0,
    squawk: str(a.squawk),
    time: now,
    feeds: new Set(["intelsky"]),
  };
}

function openskyToContact(s: OpenSkyState, now: number): LiveContact | null {
  const hex = normHex(s[0]);
  const lon = s[5];
  const lat = s[6];
  if (lon == null || lat == null) return null;
  const velMs = s[9];
  return {
    hex,
    lat,
    lon,
    callsign: str(s[1]),
    altitude: s[7] != null ? Math.round(s[7] * 3.28084) : undefined,
    speedKt: velMs != null ? Math.round(velMs * 1.94384) : undefined,
    heading: s[10] ?? 0,
    onGround: s[8],
    operatorCountry: str(s[2]),
    time: (s[3] ?? s[4]) * 1000 || now,
    feeds: new Set(["opensky"]),
  };
}

function mergeContacts(existing: LiveContact, incoming: LiveContact): LiveContact {
  for (const f of incoming.feeds) existing.feeds.add(f);

  const useIncomingPos = incoming.time >= existing.time;
  if (useIncomingPos) {
    existing.lat = incoming.lat;
    existing.lon = incoming.lon;
    existing.time = incoming.time;
    if (incoming.altitude != null) existing.altitude = incoming.altitude;
    if (incoming.speedKt != null) existing.speedKt = incoming.speedKt;
    if (incoming.heading != null) existing.heading = incoming.heading;
    if (incoming.onGround != null) existing.onGround = incoming.onGround;
  }

  existing.callsign = pickStr(incoming.callsign, existing.callsign);
  existing.registration = pickStr(incoming.registration, existing.registration);
  existing.type = pickStr(incoming.type, existing.type);
  existing.description = pickStr(incoming.description, existing.description);
  existing.operator = pickStr(incoming.operator, existing.operator);
  existing.operatorCountry = pickStr(incoming.operatorCountry, existing.operatorCountry);
  existing.squawk = pickStr(incoming.squawk, existing.squawk);

  return existing;
}

function mergeIntoMap(map: Map<string, LiveContact>, contact: LiveContact): void {
  const prev = map.get(contact.hex);
  if (!prev) {
    map.set(contact.hex, contact);
    return;
  }
  mergeContacts(prev, contact);
}

export async function fetchAdsbMil(): Promise<LiveContact[]> {
  const now = Date.now();
  const json = await fetchJSON<{ ac?: AdsbAircraft[] }>(ADSB_URL, {}, 9_000);
  const out: LiveContact[] = [];
  for (const a of json.ac ?? []) {
    const c = adsbToContact(a, now);
    if (c) out.push(c);
  }
  return out;
}

export async function fetchIntelSkyMil(): Promise<LiveContact[]> {
  const now = Date.now();
  const json = await fetchJSON<{ ac?: IntelSkyAircraft[]; now?: number }>(
    INTELSKY_URL,
    {},
    10_000,
  );
  const apiNow = json.now != null ? json.now * 1000 : now;
  const out: LiveContact[] = [];
  for (const a of json.ac ?? []) {
    const c = intelskyToContact(a, apiNow);
    if (c) out.push(c);
  }
  return out;
}

export async function fetchOpenSkyGapFill(existingHexes: Set<string>): Promise<LiveContact[]> {
  const token = await getOpenSkyToken();
  if (!token) return [];

  const json = await fetchJSON<{ states?: OpenSkyState[] | null }>(
    OPENSKY_URL,
    { headers: { Authorization: `Bearer ${token}` } },
    12_000,
  );

  const now = Date.now();
  const out: LiveContact[] = [];
  for (const s of json.states ?? []) {
    if (!s?.[0]) continue;
    const hex = normHex(s[0]);
    if (existingHexes.has(hex) || !isMilitaryHex(hex)) continue;
    const c = openskyToContact(s, now);
    if (c) out.push(c);
  }
  return out;
}

function contactToFeature(c: LiveContact): Feature {
  const mil = lookupMilitary(c.hex);
  const sources = [...c.feeds].sort().join("+");

  const props: Record<string, unknown> = {
    hex: c.hex,
    callsign: pickStr(c.callsign, c.hex) ?? c.hex,
    registration: pickStr(c.registration, mil?.registration),
    type: pickStr(c.type, mil?.type),
    description: pickStr(c.description, mil?.description),
    altitude: c.altitude,
    speed_kt: c.speedKt,
    heading: c.heading ?? 0,
    squawk: c.squawk,
    on_ground: c.onGround,
    source: sources,
    operator: pickStr(c.operator, mil?.operator),
    owner: mil?.owner,
    operator_country: pickStr(c.operatorCountry, mil?.country),
    military_reason: mil?.reason,
    match_status: mil?.matchStatus,
    time: c.time,
  };

  for (const k of Object.keys(props)) {
    if (props[k] == null || props[k] === "") delete props[k];
  }

  return feature(c.lon, c.lat, props, c.hex);
}

export interface MilitaryFlightsResult {
  features: Feature[];
  sources: { adsb: boolean; intelsky: boolean; opensky: boolean };
}

/** Fetch, merge, and enrich live military ADS-B contacts (shared by Geospatial + OPS). */
export async function loadMilitaryFlights(): Promise<MilitaryFlightsResult> {
  const [adsbRes, intelskyRes] = await Promise.allSettled([fetchAdsbMil(), fetchIntelSkyMil()]);

  const contacts: LiveContact[] = [];
  const sources = { adsb: false, intelsky: false, opensky: false };

  if (adsbRes.status === "fulfilled") {
    sources.adsb = true;
    contacts.push(...adsbRes.value);
  }
  if (intelskyRes.status === "fulfilled") {
    sources.intelsky = true;
    contacts.push(...intelskyRes.value);
  }

  const byHex = new Map<string, LiveContact>();
  for (const c of contacts) mergeIntoMap(byHex, c);

  const gapFill = await fetchOpenSkyGapFill(new Set(byHex.keys()));
  if (gapFill.length) {
    sources.opensky = true;
    for (const c of gapFill) mergeIntoMap(byHex, c);
  }

  const features = [...byHex.values()].map(contactToFeature);

  if (
    features.length === 0 &&
    adsbRes.status === "rejected" &&
    intelskyRes.status === "rejected"
  ) {
    throw adsbRes.reason ?? intelskyRes.reason;
  }

  return { features, sources };
}
