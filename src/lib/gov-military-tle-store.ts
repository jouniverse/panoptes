import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fetchText } from "@/lib/http";
import { fetchActiveGpRecords, hasSpaceTrackCredentials } from "@/lib/spacetrack";

export interface Tle {
  name: string;
  line1: string;
  line2: string;
  norad?: number;
}

export type TleSource = "space-track" | "celestrak";

export interface TleBundle {
  fetchedAt: string;
  count: number;
  source: TleSource;
  tles: Tle[];
}

export const GOV_MIL_TLE_PATH = join(process.cwd(), "public/data/gov-military-tles.json");
/** ISO-8601 fetch time — checked by `scripts/ensure-fresh-tles.mjs` before dev. */
export const GOV_MIL_TLE_TIMESTAMP_PATH = join(
  process.cwd(),
  "public/data/gov-military-tles.fetched-at",
);

/** TLE refresh interval — Space-Track updates multiple times daily. */
export const TLE_TTL_LIVE_MS = 24 * 60 * 60_000;
/** Serve cached TLEs when upstream is down (positions drift slowly). */
export const TLE_TTL_STALE_MS = 7 * 24 * 60 * 60_000;

const CELESTRAK_HEADERS = {
  "User-Agent": "Panoptes/1.0 (milint; educational orbital tracking)",
};

export function parseTle(text: string): Tle[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: Tle[] = [];
  let i = 0;
  while (i < lines.length) {
    let name = "";
    let line1 = lines[i];

    if (line1.startsWith("0 ")) {
      name = line1.slice(2).trim();
      i++;
      line1 = lines[i];
    } else if (!line1.startsWith("1 ") && lines[i + 1]?.startsWith("1 ")) {
      name = line1;
      i++;
      line1 = lines[i];
    }

    const line2 = lines[i + 1];
    if (line1?.startsWith("1 ") && line2?.startsWith("2 ")) {
      const norad = parseInt(line1.slice(2, 7).trim(), 10);
      out.push({
        name: name || `NORAD ${norad}`,
        line1,
        line2,
        norad: Number.isFinite(norad) ? norad : undefined,
      });
      i += 2;
    } else {
      i++;
    }
  }
  return out;
}

export function readDiskTleBundle(): (TleBundle & { ageMs: number }) | null {
  try {
    if (!existsSync(GOV_MIL_TLE_PATH)) return null;
    const raw = JSON.parse(readFileSync(GOV_MIL_TLE_PATH, "utf8")) as TleBundle;
    if (!raw?.tles?.length || !raw.fetchedAt) return null;
    const ageMs = Date.now() - Date.parse(raw.fetchedAt);
    if (!Number.isFinite(ageMs)) return null;
    return {
      ...raw,
      source: raw.source ?? "space-track",
      ageMs,
    };
  } catch {
    return null;
  }
}

export function writeDiskTleBundle(bundle: TleBundle): void {
  try {
    mkdirSync(join(process.cwd(), "public/data"), { recursive: true });
    writeFileSync(GOV_MIL_TLE_PATH, `${JSON.stringify(bundle)}\n`, "utf8");
    writeFileSync(GOV_MIL_TLE_TIMESTAMP_PATH, `${bundle.fetchedAt}\n`, "utf8");
  } catch {
    /* read-only FS on serverless — local/script writes only */
  }
}

function filterGpToUcs(noradIds: number[]): Promise<{ tles: Tle[]; source: TleSource }> {
  const ucs = new Set(noradIds);
  return fetchActiveGpRecords().then((rows) => {
    const tles: Tle[] = [];
    for (const row of rows) {
      const norad = parseInt(row.NORAD_CAT_ID, 10);
      if (!Number.isFinite(norad) || !ucs.has(norad)) continue;
      if (!row.TLE_LINE1?.startsWith("1 ") || !row.TLE_LINE2?.startsWith("2 ")) continue;
      tles.push({
        name: (row.OBJECT_NAME ?? `NORAD ${norad}`).trim(),
        line1: row.TLE_LINE1,
        line2: row.TLE_LINE2,
        norad,
      });
    }
    if (!tles.length) throw new Error("Space-Track: no UCS gov/mil TLEs in active catalog");
    return { tles, source: "space-track" as const };
  });
}

async function fetchTleBatchCelesTrak(norads: number[]): Promise<Tle[]> {
  const catnr = norads.join(",");
  const text = await fetchText(
    `https://celestrak.org/NORAD/elements/gp.php?CATNR=${catnr}&FORMAT=tle`,
    { headers: CELESTRAK_HEADERS },
    45_000,
  );
  return parseTle(text);
}

/** CelesTrak fallback — multi-CATNR batches when Space-Track unavailable. */
async function fetchGovMilitaryTlesCelesTrak(noradIds: number[]): Promise<Tle[]> {
  const BATCH = 50;
  const PARALLEL = 4;
  const out: Tle[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < noradIds.length; i += BATCH * PARALLEL) {
    const wave: Promise<Tle[]>[] = [];
    for (let p = 0; p < PARALLEL; p++) {
      const start = i + p * BATCH;
      const chunk = noradIds.slice(start, start + BATCH);
      if (chunk.length) wave.push(fetchTleBatchCelesTrak(chunk));
    }
    const results = await Promise.allSettled(wave);
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const t of r.value) {
        if (t.norad != null && seen.has(t.norad)) continue;
        if (t.norad != null) seen.add(t.norad);
        out.push(t);
      }
    }
  }

  if (!out.length) throw new Error("CelesTrak: no gov/mil TLEs returned");
  return out;
}

/**
 * Fetch UCS gov/mil TLEs — Space-Track primary (1 bulk GP query), CelesTrak fallback.
 * Shared by /api/satellites and `npm run tles:fetch`.
 */
export async function fetchGovMilitaryTles(
  noradIds: number[],
): Promise<{ tles: Tle[]; source: TleSource }> {
  if (hasSpaceTrackCredentials()) {
    try {
      return await filterGpToUcs(noradIds);
    } catch {
      /* fall through to CelesTrak */
    }
  }

  const tles = await fetchGovMilitaryTlesCelesTrak(noradIds);
  return { tles, source: "celestrak" };
}

export async function buildGovMilitaryBundle(noradIds: number[]): Promise<TleBundle> {
  const { tles, source } = await fetchGovMilitaryTles(noradIds);
  return {
    fetchedAt: new Date().toISOString(),
    count: tles.length,
    source,
    tles,
  };
}

export function bundleAgeHealth(ageMs: number): "live" | "degraded" | "stale" {
  if (ageMs < TLE_TTL_LIVE_MS) return "live";
  if (ageMs < TLE_TTL_STALE_MS) return "degraded";
  return "stale";
}
