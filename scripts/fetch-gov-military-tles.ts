#!/usr/bin/env npx tsx
/**
 * Prefetch UCS government+military TLEs (Space-Track primary) into public/data/.
 * Run daily: npm run tles:fetch
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "./load-env.mjs";
import {
  buildGovMilitaryBundle,
  writeDiskTleBundle,
  GOV_MIL_TLE_PATH,
} from "../src/lib/gov-military-tle-store";

loadEnv();

const NORAD_FILE = join(process.cwd(), "src/data/military-norad-ids.json");

async function main() {
  const { noradIds } = JSON.parse(readFileSync(NORAD_FILE, "utf8")) as { noradIds: number[] };
  console.log(`[tles:fetch] fetching ${noradIds.length} UCS NORAD ids…`);

  const bundle = await buildGovMilitaryBundle(noradIds);
  writeDiskTleBundle(bundle);

  console.log(
    `[tles:fetch] wrote ${GOV_MIL_TLE_PATH} (${bundle.count} TLEs via ${bundle.source})`,
  );
}

main().catch((e) => {
  console.error("[tles:fetch]", e);
  process.exit(1);
});
