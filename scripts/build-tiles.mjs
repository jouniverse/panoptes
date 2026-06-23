#!/usr/bin/env node
/**
 * build-tiles.mjs — Tier B vector-tile pipeline.
 *
 * Converts heavy geospatial datasets (roads, oil & gas pipelines/wells, large
 * reservoirs) into PMTiles archives under ./public/tiles, served as static,
 * range-requested files and rendered on-demand by the deck.gl MVT layer.
 * These datasets are far too large (GBs) to bundle or load as raw GeoJSON.
 *
 * Toolchain (auto-detected, in order of preference):
 *   1. tippecanoe  (best feature dropping / zoom handling)  -> .pmtiles
 *   2. GDAL ogr2ogr -f PMTiles  (works on GeoJSON/GPKG/SHP/FGDB directly)
 *
 * Usage:
 *   node scripts/build-tiles.mjs --demo            # tiny validation archive
 *   node scripts/build-tiles.mjs roads             # one target
 *   node scripts/build-tiles.mjs                   # all configured targets
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "static-data");
const GEO = join(ROOT, "public", "geo");
const OUT = join(ROOT, "public", "tiles");
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log("[tiles]", ...a);

function has(cmd) {
  try {
    execFileSync("bash", ["-lc", `command -v ${cmd}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const HAS_TIPPECANOE = has("tippecanoe");
const HAS_OGR = has("ogr2ogr");

/** Find first existing file in `dir` whose name includes `needle`. */
function findFile(dir, needle) {
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((f) => f.includes(needle));
  return hit ? join(dir, hit) : null;
}

/**
 * Tile targets. `minzoom`/`maxzoom` keep archives small; `layer` is the MVT
 * source-layer name the client MVT layer reads.
 */
const TARGETS = {
  roads: {
    input: () => findFile(join(SRC, "roads"), "groads-v1-roads.geojson"),
    out: "roads.pmtiles",
    layer: "roads",
    minzoom: 2,
    maxzoom: 9,
    simplify: 4,
  },
  "oil-gas-pipelines": {
    input: () => findFile(join(SRC, "oil-and-gas-infrastructure"), "pipelines.geojson"),
    out: "oil-gas-pipelines.pmtiles",
    layer: "pipelines",
    minzoom: 2,
    maxzoom: 9,
    simplify: 4,
  },
  "oil-gas-wells": {
    input: () => findFile(join(SRC, "oil-and-gas-infrastructure"), "wells.geojson"),
    out: "oil-gas-wells.pmtiles",
    layer: "wells",
    minzoom: 4,
    maxzoom: 11,
    simplify: 0,
  },
  reservoirs: {
    input: () => findFile(join(SRC, "reservoirs-and-dams"), "reservoirs.geojson"),
    out: "reservoirs.pmtiles",
    layer: "reservoirs",
    minzoom: 2,
    maxzoom: 9,
    simplify: 2,
  },
  demo: {
    input: () => join(GEO, "country-borders.geojson"),
    out: "demo-borders.pmtiles",
    layer: "borders",
    minzoom: 0,
    maxzoom: 5,
    simplify: 1,
  },
};

function tileWithTippecanoe(t, input, outPath) {
  const args = [
    "-o", outPath,
    "--force",
    "-l", t.layer,
    `-Z${t.minzoom}`,
    `-z${t.maxzoom}`,
    "--drop-densest-as-needed",
    "--extend-zooms-if-still-dropping",
    "--simplification=" + (t.simplify || 1),
    input,
  ];
  execFileSync("tippecanoe", args, { stdio: "inherit" });
}

function tileWithOgr(t, input, outPath) {
  if (existsSync(outPath)) rmSync(outPath);
  const args = [
    "-f", "PMTiles",
    outPath,
    input,
    "-nln", t.layer,
    "-dsco", `MINZOOM=${t.minzoom}`,
    "-dsco", `MAXZOOM=${t.maxzoom}`,
    "-skipfailures",
  ];
  if (t.simplify) args.push("-simplify", String(t.simplify * 0.0001));
  execFileSync("ogr2ogr", args, { stdio: "inherit" });
}

function build(id) {
  const t = TARGETS[id];
  if (!t) return log(`! unknown target "${id}"`);
  const input = t.input();
  if (!input || !existsSync(input)) {
    return log(`- skip ${id}: source not found (looked under static-data)`);
  }
  const outPath = join(OUT, t.out);
  const srcMb = (statSync(input).size / 1e6).toFixed(0);
  log(`building ${id}  <- ${input} (${srcMb} MB)`);
  const started = Date.now();
  try {
    if (HAS_TIPPECANOE) tileWithTippecanoe(t, input, outPath);
    else if (HAS_OGR) tileWithOgr(t, input, outPath);
    else throw new Error("no tippecanoe or ogr2ogr available");
    const outMb = (statSync(outPath).size / 1e6).toFixed(1);
    log(`  ✓ ${t.out}  (${outMb} MB, ${((Date.now() - started) / 1000).toFixed(0)}s)`);
  } catch (e) {
    log(`  ! failed ${id}: ${e.message}`);
  }
}

const args = process.argv.slice(2);
log(`toolchain: tippecanoe=${HAS_TIPPECANOE} ogr2ogr=${HAS_OGR}`);
if (!HAS_TIPPECANOE && !HAS_OGR) {
  log("Install one of:");
  log("  brew install tippecanoe   # recommended");
  log("  brew install gdal         # provides ogr2ogr with PMTiles driver");
  process.exit(1);
}

const ids = args.length
  ? args.map((a) => a.replace(/^--/, ""))
  : Object.keys(TARGETS).filter((k) => k !== "demo");

for (const id of ids) build(id);
log("done");
