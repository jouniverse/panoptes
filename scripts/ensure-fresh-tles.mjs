#!/usr/bin/env node
/**
 * Dev-only guard: refresh gov/mil TLEs when the on-disk cache is missing or
 * older than 24h. Runs automatically via npm `predev` before `next dev`.
 *
 * Timestamp: public/data/gov-military-tles.fetched-at (also mirrored as
 * fetchedAt inside gov-military-tles.json).
 *
 * Production/deploy: use a scheduled job (cron / Vercel cron) calling
 * `npm run tles:fetch` — do not rely on this script at runtime.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const TTL_MS = 24 * 60 * 60_000;
const TLE_JSON = join(ROOT, "public/data/gov-military-tles.json");
const TLE_TS = join(ROOT, "public/data/gov-military-tles.fetched-at");

function readFetchedAt() {
  if (existsSync(TLE_TS)) {
    const t = readFileSync(TLE_TS, "utf8").trim();
    if (t) return t;
  }
  if (existsSync(TLE_JSON)) {
    try {
      const raw = JSON.parse(readFileSync(TLE_JSON, "utf8"));
      if (raw.fetchedAt) {
        // Backfill sidecar for bundles committed before the timestamp file existed.
        mkdirSync(join(ROOT, "public/data"), { recursive: true });
        writeFileSync(TLE_TS, `${raw.fetchedAt}\n`, "utf8");
        return raw.fetchedAt;
      }
    } catch {
      /* treat as missing */
    }
  }
  return null;
}

function isStale(fetchedAt) {
  if (!fetchedAt) return true;
  const ageMs = Date.now() - Date.parse(fetchedAt);
  if (!Number.isFinite(ageMs)) return true;
  return ageMs >= TTL_MS;
}

const fetchedAt = readFetchedAt();

if (isStale(fetchedAt)) {
  const reason = fetchedAt ? "cache older than 24h" : "cache missing";
  console.log(`[dev] TLE ${reason} — running npm run tles:fetch …`);
  execSync("npm run tles:fetch", { cwd: ROOT, stdio: "inherit" });
} else {
  const ageH = ((Date.now() - Date.parse(fetchedAt)) / 3_600_000).toFixed(1);
  console.log(`[dev] TLE cache fresh (${ageH}h old) — skipping fetch`);
}
