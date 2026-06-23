#!/usr/bin/env node
/**
 * build-geo.mjs — Tier A data normalization.
 *
 * Reads curated source datasets from ./static-data and writes slimmed,
 * normalized GeoJSON FeatureCollections into ./public/geo, named to match
 * each layer's `source.ref` in src/config/layer-registry.ts.
 *
 * Run: npm run geo:build
 *
 * Heavy Tier B datasets (roads, night-lights, OGIM) are NOT handled here — see
 * scripts/build-tiles.mjs (PMTiles pipeline).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "static-data");
const OUT = join(ROOT, "public", "geo");
const DATA = join(ROOT, "src", "data");
const PUBDATA = join(ROOT, "public", "data");
mkdirSync(OUT, { recursive: true });
mkdirSync(DATA, { recursive: true });
mkdirSync(PUBDATA, { recursive: true });

const log = (...a) => console.log("[geo]", ...a);

function readJSON(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function pick(obj, keys) {
  const o = {};
  for (const k of keys) if (obj[k] != null && obj[k] !== "") o[k] = obj[k];
  return o;
}

function write(name, features) {
  const fc = { type: "FeatureCollection", features };
  const path = join(OUT, name);
  writeFileSync(path, JSON.stringify(fc));
  const kb = (statSync(path).size / 1024).toFixed(0);
  log(`wrote ${name}  (${features.length} features, ${kb} KB)`);
}

function pt(lon, lat, props) {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: props };
}

/** Minimal RFC-4180-ish CSV parser (handles quoted fields, commas, quotes). */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const tasks = {
  "country-borders.geojson"() {
    const fc = readJSON(join(SRC, "country-maps-geojson/countries.geojson"));
    const features = fc.features.map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: pick(f.properties, [
        "NAME", "ADMIN", "ISO_A3", "CONTINENT", "SUBREGION", "POP_EST", "GDP_MD", "ECONOMY",
      ]),
    }));
    write("country-borders.geojson", features);
  },

  "populated-places.geojson"() {
    const fc = readJSON(join(SRC, "populated-places/populated-places-simple.geojson"));
    const features = fc.features.map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: pick(f.properties, [
        "NAME", "name", "NAMEASCII", "nameascii", "ADM0NAME", "adm0name", "POP_MAX", "pop_max",
        "FEATURECLA",
      ]),
    }));
    write("populated-places.geojson", features);
  },

  "military-bases.geojson"() {
    const fc = readJSON(join(SRC, "military-bases/military-bases.geojson"));
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, ["name", "description"]),
      }));
    write("military-bases.geojson", features);
  },

  "launch-sites.geojson"() {
    const list = readJSON(join(SRC, "launch-sites/all-launch-sites.json"));
    const features = list
      .filter((d) => Array.isArray(d.Coordinates) && d.Coordinates.length === 2)
      .map((d) => {
        const [lat, lon] = d.Coordinates;
        return pt(lon, lat, {
          name: d.Location,
          country: d.Country,
          operational: d["Operational date"],
          launches: d["Number of rocket launches"],
          heaviest: d["Heaviest rocket launched"],
          notes: d.Notes,
        });
      });
    write("launch-sites.geojson", features);
  },

  "major-ports.geojson"() {
    const fc = readJSON(join(SRC, "major-ports/major-ports.geojson"));
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "PORT_NAME", "COUNTRY", "HARBORSIZE", "HARBORTYPE", "INDEX_NO",
        ]),
      }));
    write("major-ports.geojson", features);
  },

  "submarine-cables.geojson"() {
    const fc = readJSON(join(SRC, "submarine-cables/submarine-cables.json"));
    const features = fc.features.map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: pick(f.properties, ["name", "id", "color"]),
    }));
    write("submarine-cables.geojson", features);
  },

  "data-centers.geojson"() {
    const list = readJSON(join(SRC, "data-centers/datacenters.json"));
    const features = list
      .filter((d) => Array.isArray(d.city_coords) && d.city_coords.length === 2)
      .map((d) => {
        const [lat, lon] = d.city_coords;
        return pt(lon, lat, {
          name: d.name,
          company: d.company,
          city: d.city,
          country: d.country,
        });
      });
    write("data-centers.geojson", features);
  },

  "dams.geojson"() {
    const fc = readJSON(join(SRC, "reservoirs-and-dams/dams.geojson"));
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "DAM_NAME", "RES_NAME", "RIVER", "COUNTRY", "YEAR", "DAM_HGT_M", "AREA_SKM", "CAP_MCM", "MAIN_USE",
        ]),
      }));
    write("dams.geojson", features);
  },

  "mineral-deposits.geojson"() {
    const fc = readJSON(join(SRC, "mines-and-mineral-deposits/critical-minerals-deposits-and-mines.geojson"));
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "DEPOSIT_NAME", "CRITICAL_MINERAL", "DEPOSIT_TYPE", "LOCATION",
        ]),
      }));
    write("mineral-deposits.geojson", features);
  },

  "undiscovered-oil-gas.geojson"() {
    const fc = readJSON(join(SRC, "undiscovered-oil-and-gas-resources/undiscovered-oil-and-gas-resources.geojson"));
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, ["AU_NAME", "PRV_NAME", "REG_NAME", "TPS_NAME"]),
      }));
    write("undiscovered-oil-gas.geojson", features);
  },

  "country-centroids.json"() {
    const fc = readJSON(join(SRC, "country-maps-geojson/countries.geojson"));
    const flatten = (coords, acc) => {
      if (typeof coords[0] === "number") { acc.push(coords); return; }
      for (const c of coords) flatten(c, acc);
    };
    const out = {};
    for (const f of fc.features) {
      if (!f.geometry) continue;
      const acc = [];
      flatten(f.geometry.coordinates, acc);
      if (!acc.length) continue;
      let x = 0, y = 0;
      for (const [lon, lat] of acc) { x += lon; y += lat; }
      const lon = x / acc.length;
      const lat = y / acc.length;
      const p = f.properties;
      const rec = { lon, lat, name: p.NAME || p.ADMIN, iso3: p.ISO_A3 };
      if (p.ISO_A2 && p.ISO_A2 !== "-99") out[p.ISO_A2] = rec;
      if (p.ISO_A3 && p.ISO_A3 !== "-99") out[p.ISO_A3] = rec;
    }
    const path = join(DATA, "country-centroids.json");
    writeFileSync(path, JSON.stringify(out));
    log(`wrote src/data/country-centroids.json  (${Object.keys(out).length} keys)`);
  },

  "country-indicators.json"() {
    const ind = {}; // iso3 -> record
    const ensure = (iso, name) => {
      if (!iso) return null;
      if (!ind[iso]) ind[iso] = { iso, name };
      if (name && !ind[iso].name) ind[iso].name = name;
      return ind[iso];
    };
    const norm = (s) => (s || "").toLowerCase().replace(/[^a-z]/g, "");
    const nameToIso = {};

    const readCsv = (p) => parseCSV(readFileSync(join(SRC, p), "utf8"));
    const num = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? undefined : n; };

    // Global Peace Index (current) — geocode + overall score + rank
    try {
      const rows = readCsv("global-peace-and-terrorism-index/global-peace-index-2026-details.csv");
      const h = rows[0];
      const ci = h.indexOf("country"), gi = h.indexOf("geocode"), si = h.indexOf("Overall Score"), ri = h.indexOf("Rank");
      for (let r = 1; r < rows.length; r++) {
        const iso = rows[r][gi];
        const rec = ensure(iso, rows[r][ci]);
        if (!rec) continue;
        rec.gpi = num(rows[r][si]);
        rec.gpiRank = num(rows[r][ri]);
        nameToIso[norm(rows[r][ci])] = iso;
      }
    } catch (e) { log("  indicators: GPI skipped", e.message); }

    // Global Terrorism Index — latest year per iso3c
    try {
      const rows = readCsv("global-peace-and-terrorism-index/global-terrorism-index.csv");
      const h = rows[0];
      const ii = h.indexOf("iso3c"), yi = h.indexOf("year"), si = h.indexOf("Score"), ci = h.indexOf("Country");
      const latest = {};
      for (let r = 1; r < rows.length; r++) {
        const iso = rows[r][ii]; const y = num(rows[r][yi]);
        if (!iso || y == null) continue;
        if (!latest[iso] || y > latest[iso].y) latest[iso] = { y, score: num(rows[r][si]), name: rows[r][ci] };
      }
      for (const [iso, v] of Object.entries(latest)) {
        const rec = ensure(iso, v.name); if (rec) rec.gti = v.score;
        nameToIso[norm(v.name)] = iso;
      }
    } catch (e) { log("  indicators: GTI skipped", e.message); }

    // Global Conflict Risk Index — latest year per ISO, conflict intensity
    try {
      const rows = readCsv("global-conflict-risk-index/global-conflict-risk-index.csv");
      const h = rows[0];
      const ii = h.indexOf("ISO"), yi = h.indexOf("YEAR"), ci = h.indexOf("COUNTRY"), vi = h.indexOf("CON_INT");
      const latest = {};
      for (let r = 1; r < rows.length; r++) {
        const iso = rows[r][ii]; const y = num(rows[r][yi]);
        if (!iso || y == null) continue;
        if (!latest[iso] || y > latest[iso].y) latest[iso] = { y, v: num(rows[r][vi]), name: rows[r][ci] };
      }
      for (const [iso, v] of Object.entries(latest)) {
        const rec = ensure(iso, v.name); if (rec) rec.gcri = v.v;
      }
    } catch (e) { log("  indicators: GCRI skipped", e.message); }

    // Fragile States Index — join by name
    try {
      const rows = readCsv("fragile-states-index/fragile-states-index.csv");
      const h = rows[0];
      const ci = h.indexOf("Country"), ti = h.indexOf("Total");
      for (let r = 1; r < rows.length; r++) {
        const iso = nameToIso[norm(rows[r][ci])];
        const rec = ensure(iso, rows[r][ci]); if (rec) rec.fsi = num(rows[r][ti]);
      }
    } catch (e) { log("  indicators: FSI skipped", e.message); }

    // Global Hunger Index — join by name, 2025 column
    try {
      const rows = readCsv("global-hunger-index/global-hunger-index-2025.csv");
      const h = rows[0];
      const ci = 0, gi = h.indexOf("2025");
      for (let r = 1; r < rows.length; r++) {
        const iso = nameToIso[norm(rows[r][ci])];
        const rec = ensure(iso, rows[r][ci]); if (rec) rec.ghi = num(rows[r][gi]);
      }
    } catch (e) { log("  indicators: GHI skipped", e.message); }

    const path = join(PUBDATA, "country-indicators.json");
    writeFileSync(path, JSON.stringify(ind));
    log(`wrote public/data/country-indicators.json  (${Object.keys(ind).length} countries)`);
  },

  "water-conflicts.geojson"() {
    const text = readFileSync(join(SRC, "water-conflicts/water-conflicts.csv"), "utf8");
    const rows = parseCSV(text);
    const header = rows[0];
    const idx = (name) => header.indexOf(name);
    const iLat = idx("Latitude"), iLon = idx("Longitude");
    const features = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const lat = parseFloat(row[iLat]);
      const lon = parseFloat(row[iLon]);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      features.push(
        pt(lon, lat, {
          Title: row[idx("Title")],
          Date: row[idx("Date")],
          Country: row[idx("Country")],
          "Conflict Type": row[idx("Conflict Type")],
          Description: (row[idx("Description")] || "").slice(0, 400),
          Sources: row[idx("Sources")],
        }),
      );
    }
    write("water-conflicts.geojson", features);
  },
};

const only = process.argv.slice(2);
const names = only.length
  ? only.map((n) => (n.endsWith(".geojson") ? n : `${n}.geojson`))
  : Object.keys(tasks);

let ok = 0;
for (const name of names) {
  const fn = tasks[name];
  if (!fn) { log(`! no task for ${name}`); continue; }
  try {
    if (!existsSync(SRC)) throw new Error("static-data/ not found");
    fn();
    ok++;
  } catch (e) {
    log(`! failed ${name}: ${e.message}`);
  }
}
log(`done — ${ok}/${names.length} layers built into public/geo`);
