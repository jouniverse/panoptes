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
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from "node:fs";
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

/** Round coordinates to reduce GeoJSON size for complex polygon layers. */
function roundCoord(n, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function roundGeometry(geom, decimals = 2) {
  if (!geom) return geom;
  const roundPos = (c) =>
    Array.isArray(c[0]) ? c.map(roundPos) : [roundCoord(c[0], decimals), roundCoord(c[1], decimals)];
  if (geom.type === "Polygon") {
    return { type: "Polygon", coordinates: geom.coordinates.map((r) => r.map(roundPos)) };
  }
  if (geom.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geom.coordinates.map((p) => p.map((r) => r.map(roundPos))),
    };
  }
  if (geom.type === "LineString") {
    return { type: "LineString", coordinates: geom.coordinates.map(roundPos) };
  }
  if (geom.type === "MultiLineString") {
    return {
      type: "MultiLineString",
      coordinates: geom.coordinates.map((l) => l.map(roundPos)),
    };
  }
  return geom;
}

/** Ring jitter for stacked coordinates (mirrors src/lib/jitter.ts). */
function clusterJitter(lon, lat, index, count, opts = {}) {
  if (!count || count <= 1) return [lon, lat];
  const perRing = 16;
  const ring = Math.floor(index / perRing);
  const pos = index % perRing;
  const inRing = Math.min(perRing, count - ring * perRing);
  if (inRing <= 0) return [lon, lat];
  const baseR = opts.baseR ?? 0.05;
  const ringStep = opts.ringStep ?? 0.04;
  const R = baseR + ring * ringStep;
  const ang = (pos / inRing) * Math.PI * 2;
  const plat = lat + R * Math.sin(ang);
  const plon = lon + (R * Math.cos(ang)) / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
  return [plon, plat];
}

/** Data-center overlap jitter tiers (see notes/data/data-centers/). */
const DC_JITTER_BY_TIER = {
  exact_colocation: { baseR: 0.00004, ringStep: 0.00002 },
  street_level: { baseR: 0.0002, ringStep: 0.0001 },
  city_centroid: { baseR: 0.002, ringStep: 0.001 },
  mismatch: { baseR: 0.004, ringStep: 0.002 },
};

function dcNormalizeAddress(address) {
  return (address || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function dcValidationDistM(props) {
  const v = props?.validation_distance_m;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dcLocationTier(props) {
  const dist = dcValidationDistM(props);
  const q = props?.geocode_quality || "";
  const addr = props?.address || "";

  if (q === "source_mismatch") return "mismatch";

  const cityQuality =
    q === "geocoded_city" ||
    q === "source_city_center" ||
    q === "source_unverified";
  if (cityQuality || (dist != null && dist > 15000) || /\btbc\b/i.test(addr)) {
    return "city_centroid";
  }

  if (
    dist === 0 ||
    q === "source_exact" ||
    ((q === "geocoded_street" || q === "geocoded_exact") &&
      dist != null &&
      dist <= 200)
  ) {
    return "exact_colocation";
  }

  if (
    dist != null &&
    dist <= 2000 &&
    (q === "geocoded_street" ||
      q === "geocoded_exact" ||
      q === "geocoded_neighbourhood")
  ) {
    return "street_level";
  }

  if (dist != null && dist <= 2000) return "street_level";
  return "city_centroid";
}

function dcCoordKey(lon, lat) {
  return `${Number(lon).toFixed(5)},${Number(lat).toFixed(5)}`;
}

function dcSubGroupKey(record, tier) {
  if (tier === "exact_colocation") {
    return `exact|${dcNormalizeAddress(record.properties.address)}`;
  }
  if (tier === "street_level") return "street";
  if (tier === "mismatch") return "mismatch";
  return "city";
}

/** Assign overlap group index/size/tier per data-center record. */
function dcAssignOverlapGroups(raw) {
  const assignments = raw.map(() => ({
    clusterIndex: 0,
    overlapGroupSize: 1,
    locationTier: "singleton",
    jittered: false,
    jitterOpts: null,
  }));

  const byCoord = new Map();
  raw.forEach((r, i) => {
    r._i = i;
    r._tier = dcLocationTier(r.properties);
    const k = dcCoordKey(r.srcLon, r.srcLat);
    if (!byCoord.has(k)) byCoord.set(k, []);
    byCoord.get(k).push(r);
  });

  for (const members of byCoord.values()) {
    if (members.length <= 1) {
      assignments[members[0]._i].locationTier = members[0]._tier;
      continue;
    }

    const cityLike = members.filter(
      (m) => m._tier === "city_centroid" || m._tier === "mismatch",
    ).length;
    const useWholeCoordCity = cityLike > members.length / 2;

    if (useWholeCoordCity) {
      const tier = members.some((m) => m._tier === "mismatch")
        ? "mismatch"
        : "city_centroid";
      const opts = DC_JITTER_BY_TIER[tier];
      members.forEach((m, idx) => {
        assignments[m._i] = {
          clusterIndex: idx,
          overlapGroupSize: members.length,
          locationTier: tier,
          jittered: true,
          jitterOpts: opts,
        };
      });
      continue;
    }

    const subGroups = new Map();
    for (const m of members) {
      const sk = dcSubGroupKey(m, m._tier);
      if (!subGroups.has(sk)) subGroups.set(sk, []);
      subGroups.get(sk).push(m);
    }

    for (const sg of subGroups.values()) {
      if (sg.length <= 1) {
        assignments[sg[0]._i].locationTier = sg[0]._tier;
        continue;
      }
      const tier = sg[0]._tier;
      const opts = DC_JITTER_BY_TIER[tier] ?? DC_JITTER_BY_TIER.city_centroid;
      sg.forEach((m, idx) => {
        assignments[m._i] = {
          clusterIndex: idx,
          overlapGroupSize: sg.length,
          locationTier: tier,
          jittered: true,
          jitterOpts: opts,
        };
      });
    }
  }

  return assignments;
}

const VOLCANO_OBS = {
  AVO: "Alaska Volcano Observatory",
  NMI: "Nevado del Ruiz Observatory",
  YVO: "Yellowstone Volcano Observatory",
  CVO: "Cascades Volcano Observatory",
  CALVO: "California Volcano Observatory",
  HVO: "Hawaiian Volcano Observatory",
  OTHER: "Other / unmonitored",
};

function write(name, features) {
  const fc = { type: "FeatureCollection", features };
  const path = join(OUT, name);
  writeFileSync(path, JSON.stringify(fc));
  const kb = (statSync(path).size / 1024).toFixed(0);
  log(`wrote ${name}  (${features.length} features, ${kb} KB)`);
}

function pt(lon, lat, props) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: props,
  };
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
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      /* skip */
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const tasks = {
  "country-borders.geojson"() {
    const fc = readJSON(join(SRC, "country-maps-geojson/countries.geojson"));
    const features = fc.features.map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: pick(f.properties, [
        "NAME",
        "ADMIN",
        "ISO_A3",
        "CONTINENT",
        "SUBREGION",
        "POP_EST",
        "GDP_MD",
        "ECONOMY",
      ]),
    }));
    write("country-borders.geojson", features);
  },

  "populated-places.geojson"() {
    const fc = readJSON(
      join(SRC, "populated-places/populated-places-simple.geojson"),
    );
    const features = fc.features.map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: pick(f.properties, [
        "NAME",
        "name",
        "NAMEASCII",
        "nameascii",
        "ADM0NAME",
        "adm0name",
        "POP_MAX",
        "pop_max",
        "FEATURECLA",
      ]),
    }));
    write("populated-places.geojson", features);
  },

  "military-bases.geojson"() {
    const fc = readJSON(join(SRC, "military-bases/all-military-bases.geojson"));
    /** Per-record provenance tags in the merged static-data file → public labels. */
    const sourceLabel = {
      "us-military-bases.csv":
        "US Base Project — FY2024 Base Structure Report (usbaseproject.com)",
      "military-bases.geojson":
        "OSINT Military Base Map (sites.google.com/view/osintmilitarymap)",
    };
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => {
        const p = f.properties ?? {};
        const rawSource = p.source;
        const source =
          (rawSource && sourceLabel[rawSource]) ||
          (typeof rawSource === "string" ? rawSource : undefined);
        return {
          type: "Feature",
          geometry: f.geometry,
          // Keep the descriptive fields so the right panel is useful (operator,
          // host country/region, service component, nearest city, description).
          properties: pick(
            {
              ...p,
              source,
            },
            [
              "name",
              "operator_country",
              "location_country",
              "location_region",
              "service_component",
              "nearest_city",
              "description",
              "source",
            ],
          ),
        };
      });
    write("military-bases.geojson", features);
  },

  "missile-silos.geojson"() {
    const fc = readJSON(join(SRC, "nuclear-missile/missile-sites.geojson"));
    const features = fc.features
      .filter((f) => f.geometry?.type === "Point")
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "name",
          "country",
          "missile",
          "startyear",
          "stopyear",
          "notes",
        ]),
      }));
    write("missile-silos.geojson", features);
  },

  "nuclear-test-sites.geojson"() {
    const fc = readJSON(join(SRC, "nuclear-missile/nuclear-bomb-test-sites.geojson"));
    const features = fc.features
      .filter((f) => f.geometry?.type === "Point")
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "Site name",
          "Site location",
          "Country",
          "label",
          "Notes",
        ]),
      }));
    write("nuclear-test-sites.geojson", features);
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
          "PORT_NAME",
          "COUNTRY",
          "HARBORSIZE",
          "HARBORTYPE",
          "INDEX_NO",
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
    const fc = readJSON(join(SRC, "data-centers/datacenters.geojson"));
    const raw = fc.features
      .filter(
        (f) =>
          f.geometry &&
          Array.isArray(f.geometry.coordinates) &&
          f.geometry.coordinates.length === 2,
      )
      .map((f) => {
        const [srcLon, srcLat] = f.geometry.coordinates;
        return {
          srcLon,
          srcLat,
          properties: pick(f.properties, [
            "name",
            "company",
            "city",
            "country",
            "street",
            "address",
            "geocode_quality",
            "geocode_source",
            "validation_distance_m",
            "geocode_confidence",
          ]),
        };
      });

    const overlap = dcAssignOverlapGroups(raw);

    const features = raw.map((r, i) => {
      const a = overlap[i];
      const [lon, lat] = a.jittered
        ? clusterJitter(
            r.srcLon,
            r.srcLat,
            a.clusterIndex,
            a.overlapGroupSize,
            a.jitterOpts,
          )
        : [r.srcLon, r.srcLat];
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
          ...r.properties,
          source_longitude: r.srcLon,
          source_latitude: r.srcLat,
          cluster_size: a.overlapGroupSize,
          overlap_group_size: a.overlapGroupSize,
          location_tier: a.locationTier,
          jittered: a.jittered,
        },
      };
    });
    write("data-centers.geojson", features);
  },

  "dams.geojson"() {
    const fc = readJSON(join(SRC, "dams-and-reservoirs/dams.geojson"));
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "DAM_NAME",
          "RES_NAME",
          "RIVER",
          "COUNTRY",
          "YEAR",
          "DAM_HGT_M",
          "AREA_SKM",
          "CAP_MCM",
          "MAIN_USE",
        ]),
      }));
    write("dams.geojson", features);
  },

  // Renamed from mineral-deposits.geojson (plan §3.12): this file is the USGS
  // *critical minerals* dataset; "mineral-deposits" is now the broader USGS
  // major nonfuel deposits file below.
  "critical-minerals.geojson"() {
    const fc = readJSON(
      join(
        SRC,
        "mines-and-mineral-deposits/critical-minerals-deposits-and-mines.geojson",
      ),
    );
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "DEPOSIT_NAME",
          "CRITICAL_MINERAL",
          "DEPOSIT_TYPE",
          "LOCATION",
        ]),
      }));
    write("critical-minerals.geojson", features);
  },

  "mineral-deposits.geojson"() {
    const fc = readJSON(
      join(SRC, "mines-and-mineral-deposits/mineral-deposits.geojson"),
    );
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "DEP_NAME",
          "COMMODITY",
          "DEP_TYPE",
          "COUNTRY",
          "STATE",
          "CATEGORY",
          "URL",
        ]),
      }));
    write("mineral-deposits.geojson", features);
  },

  "iron-ore-mines.geojson"() {
    const fc = readJSON(join(SRC, "gem/iron-and-steel/iron-ore-mines.geojson"));
    const keep = new Set(["operating", "proposed"]);
    const features = fc.features
      .filter((f) => f.geometry && keep.has(f.properties["Operating status"]))
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "Asset name (English)",
          "Operating status",
          "Country/Area",
          "Owner",
          "Production 2024 (ttpa)",
          "Design capacity (ttpa)",
          "Start date",
        ]),
      }));
    write("iron-ore-mines.geojson", features);
  },

  "undiscovered-oil-gas.geojson"() {
    const fc = readJSON(
      join(
        SRC,
        "undiscovered-oil-and-gas-resources/undiscovered-oil-and-gas-resources.geojson",
      ),
    );
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "AU_NAME",
          "PRV_NAME",
          "REG_NAME",
          "TPS_NAME",
        ]),
      }));
    write("undiscovered-oil-gas.geojson", features);
  },

  "country-centroids.json"() {
    const fc = readJSON(join(SRC, "country-maps-geojson/countries.geojson"));
    const flatten = (coords, acc) => {
      if (typeof coords[0] === "number") {
        acc.push(coords);
        return;
      }
      for (const c of coords) flatten(c, acc);
    };
    const out = {};
    for (const f of fc.features) {
      if (!f.geometry) continue;
      const acc = [];
      flatten(f.geometry.coordinates, acc);
      if (!acc.length) continue;
      let x = 0,
        y = 0;
      for (const [lon, lat] of acc) {
        x += lon;
        y += lat;
      }
      const lon = x / acc.length;
      const lat = y / acc.length;
      const p = f.properties;
      // Natural Earth sets ISO_A2/ISO_A3 to "-99" for several countries
      // (France, Norway, etc.); fall back to the *_EH variants so downstream
      // ISO-code lookups (e.g. internet outages) resolve them.
      const a2 = [p.ISO_A2, p.ISO_A2_EH, p.WB_A2].find((v) => v && v !== "-99");
      const a3 = [p.ISO_A3, p.ISO_A3_EH, p.WB_A3, p.ADM0_A3].find(
        (v) => v && v !== "-99",
      );
      const rec = { lon, lat, name: p.NAME || p.ADMIN, iso3: a3 };
      if (a2) out[a2] = rec;
      if (a3) out[a3] = rec;
    }
    const path = join(DATA, "country-centroids.json");
    writeFileSync(path, JSON.stringify(out));
    log(
      `wrote src/data/country-centroids.json  (${Object.keys(out).length} keys)`,
    );
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
    const num = (v) => {
      const n = parseFloat(v);
      return Number.isNaN(n) ? undefined : n;
    };

    // Global Peace Index (current) — geocode + overall score + rank
    try {
      const rows = readCsv(
        "global-indices/global-peace-and-terrorism-index/global-peace-index-2026-details.csv",
      );
      const h = rows[0];
      const ci = h.indexOf("country"),
        gi = h.indexOf("geocode"),
        si = h.indexOf("Overall Score"),
        ri = h.indexOf("Rank");
      for (let r = 1; r < rows.length; r++) {
        const iso = rows[r][gi];
        const rec = ensure(iso, rows[r][ci]);
        if (!rec) continue;
        rec.gpi = num(rows[r][si]);
        rec.gpiRank = num(rows[r][ri]);
        nameToIso[norm(rows[r][ci])] = iso;
      }
    } catch (e) {
      log("  indicators: GPI skipped", e.message);
    }

    // Global Terrorism Index — latest year per iso3c
    try {
      const rows = readCsv(
        "global-indices/global-peace-and-terrorism-index/global-terrorism-index.csv",
      );
      const h = rows[0];
      const ii = h.indexOf("iso3c"),
        yi = h.indexOf("year"),
        si = h.indexOf("Score"),
        ci = h.indexOf("Country");
      const latest = {};
      for (let r = 1; r < rows.length; r++) {
        const iso = rows[r][ii];
        const y = num(rows[r][yi]);
        if (!iso || y == null) continue;
        if (!latest[iso] || y > latest[iso].y)
          latest[iso] = { y, score: num(rows[r][si]), name: rows[r][ci] };
      }
      for (const [iso, v] of Object.entries(latest)) {
        const rec = ensure(iso, v.name);
        if (rec) rec.gti = v.score;
        nameToIso[norm(v.name)] = iso;
      }
    } catch (e) {
      log("  indicators: GTI skipped", e.message);
    }

    // Enrich name→ISO map (World Bank + ACLED aliases)
    try {
      const wbRows = readCsv("world-bank/world-bank-countries.csv");
      const wh = wbRows[0];
      const codeI = wh.indexOf("Code");
      const nameI = wh.indexOf("Name");
      for (let r = 1; r < wbRows.length; r++) {
        const iso = wbRows[r][codeI];
        const name = wbRows[r][nameI];
        if (iso && name) nameToIso[norm(name)] = iso;
      }
    } catch (e) {
      log("  indicators: WB country names skipped", e.message);
    }
    Object.assign(nameToIso, {
      democraticrepublicofcongo: "COD",
      republicofcongo: "COG",
      unitedstates: "USA",
      unitedstatesofamerica: "USA",
      turkey: "TUR",
      ivorycoast: "CIV",
      easttimor: "TLS",
      czechrepublic: "CZE",
      gambia: "GMB",
      thegambia: "GMB",
      palestine: "PSE",
      russia: "RUS",
      russianfederation: "RUS",
      venezuela: "VEN",
      iran: "IRN",
      egypt: "EGY",
      zimbabwe: "ZWE",
      slovakia: "SVK",
      northkorea: "PRK",
      southkorea: "KOR",
      laos: "LAO",
      syria: "SYR",
      moldova: "MDA",
      northmacedonia: "MKD",
      eswatini: "SWZ",
      myanmar: "MMR",
      burma: "MMR",
      capeverde: "CPV",
      kyrgyzstan: "KGZ",
      bolivia: "BOL",
      vietnam: "VNM",
      bahamas: "BHS",
      thebahamas: "BHS",
      brunei: "BRN",
      bruneidarussalam: "BRN",
      belize: "BLZ",
      comoros: "COM",
      suriname: "SUR",
      malta: "MLT",
      fiji: "FJI",
      maldives: "MDV",
      luxembourg: "LUX",
      liechtenstein: "LIE",
      micronesia: "FSM",
      dominica: "DMA",
      barbados: "BRB",
      grenada: "GRD",
      seychelles: "SYC",
      samoa: "WSM",
      tonga: "TON",
      tuvalu: "TUV",
      vanuatu: "VUT",
      solomonislands: "SLB",
      saotomeandprincipe: "STP",
      sanmarino: "SMR",
      monaco: "MCO",
      andorra: "AND",
      antiguaandbarbuda: "ATG",
      saintkittsandnevis: "KNA",
      saintlucia: "LCA",
      saintvincentandthegrenadines: "VCT",
      puertorico: "PRI",
    });

    // ACLED Conflict Index — Index Ranking (1 = most conflict, 156 = least)
    try {
      const rows = readJSON(
        join(SRC, "global-indices/conflict-index/conflict-index.json"),
      );
      for (const row of rows) {
        const iso = nameToIso[norm(row.Country)];
        const rank = num(row["Index Ranking"]);
        if (!iso || rank == null) continue;
        const rec = ensure(iso, row.Country);
        if (rec) rec.aci = rank;
      }
    } catch (e) {
      log("  indicators: ACI skipped", e.message);
    }

    // Fragile States Index — join by name
    try {
      const rows = readCsv(
        "global-indices/fragile-states-index/fragile-states-index.csv",
      );
      const h = rows[0];
      const ci = h.indexOf("Country"),
        ti = h.indexOf("Total");
      for (let r = 1; r < rows.length; r++) {
        const iso = nameToIso[norm(rows[r][ci])];
        const rec = ensure(iso, rows[r][ci]);
        if (rec) rec.fsi = num(rows[r][ti]);
      }
    } catch (e) {
      log("  indicators: FSI skipped", e.message);
    }

    // Global Hunger Index — join by name, 2025 column
    try {
      const rows = readCsv(
        "global-indices/global-hunger-index/global-hunger-index-2025.csv",
      );
      const h = rows[0];
      const ci = 0,
        gi = h.indexOf("2025");
      for (let r = 1; r < rows.length; r++) {
        const iso = nameToIso[norm(rows[r][ci])];
        const rec = ensure(iso, rows[r][ci]);
        if (rec) rec.ghi = num(rows[r][gi]);
      }
    } catch (e) {
      log("  indicators: GHI skipped", e.message);
    }

    // CINC snapshot (COW NMC v7)
    try {
      const cinc = readJSON(join(SRC, "cow/composite-index-of-national-capability.json"));
      for (const rec of Object.values(cinc.countries ?? {})) {
        const r = ensure(rec.iso, rec.name);
        if (r) r.cinc = num(rec.cinc);
      }
    } catch (e) {
      log("  indicators: CINC skipped", e.message);
    }

    // Corruption Perceptions Index — latest year per ISO3 Code
    try {
      const rows = readJSON(
        join(SRC, "global-indices/corruption-perceptions-index/corruption-perceptions-index.json"),
      );
      const latest = {};
      for (const row of rows) {
        const iso = row.Code;
        const y = num(row.Year);
        const v = num(row["Corruption Perceptions Index"]);
        if (!iso || y == null || v == null) continue;
        if (!latest[iso] || y > latest[iso].y)
          latest[iso] = { y, v, name: row.Entity };
      }
      for (const [iso, v] of Object.entries(latest)) {
        const rec = ensure(iso, v.name);
        if (rec) rec.corpi = v.v;
      }
    } catch (e) {
      log("  indicators: CorPI skipped", e.message);
    }

    // Global Cybersecurity Index — latest year column per REF_AREA
    try {
      const rows = readJSON(
        join(SRC, "global-indices/global-cybersecurity-index/global-cybersecurity-index.json"),
      );
      for (const row of rows) {
        const iso = row.REF_AREA;
        if (!iso) continue;
        const years = Object.keys(row)
          .filter((k) => /^\d{4}$/.test(k))
          .map(Number)
          .sort((a, b) => b - a);
        if (!years.length) continue;
        const y = years[0];
        const rec = ensure(iso, row.REF_AREA_LABEL);
        if (rec) rec.gci = num(row[String(y)]);
      }
    } catch (e) {
      log("  indicators: GCI skipped", e.message);
    }

    // Human Development Index — latest year per Code
    try {
      const rows = readJSON(
        join(SRC, "global-indices/human-develpment-index/human-development-index.json"),
      );
      const latest = {};
      for (const row of rows) {
        const iso = row.Code;
        const y = num(row.Year);
        const v = num(row["Human Development Index"]);
        if (!iso || y == null || v == null) continue;
        if (!latest[iso] || y > latest[iso].y)
          latest[iso] = { y, v, name: row.Entity };
      }
      for (const [iso, v] of Object.entries(latest)) {
        const rec = ensure(iso, v.name);
        if (rec) rec.hdi = v.v;
      }
    } catch (e) {
      log("  indicators: HDI skipped", e.message);
    }

    // Safety & Security Index (WEF TTDI) — WEF_TTDI_SCR rows only
    try {
      const rows = parseCSV(
        readFileSync(
          join(SRC, "global-indices/safety-and-security-index/safety-and-security-index.csv"),
          "utf8",
        ),
      );
      const h = rows[0];
      const areaI = h.indexOf("REF_AREA");
      const typeI = h.indexOf("TYPE");
      const labelI = h.indexOf("REF_AREA_LABEL");
      const yearCols = h.filter((c) => /^\d{4}$/.test(c));
      const latest = {};
      for (let r = 1; r < rows.length; r++) {
        if (rows[r][typeI] !== "WEF_TTDI_SCR") continue;
        const iso = rows[r][areaI];
        if (!iso || iso.length !== 3) continue;
        let bestY = null;
        let bestV = null;
        for (const y of yearCols) {
          const raw = rows[r][h.indexOf(y)];
          if (raw == null || raw === "") continue;
          const v = parseFloat(raw);
          const yi = parseInt(y, 10);
          if (Number.isNaN(v)) continue;
          if (bestY == null || yi >= bestY) {
            bestY = yi;
            bestV = v;
          }
        }
        if (bestV == null) continue;
        latest[iso] = { v: bestV, name: rows[r][labelI] };
      }
      for (const [iso, { v, name }] of Object.entries(latest)) {
        const rec = ensure(iso, name);
        if (rec) rec.ssi = v;
      }
    } catch (e) {
      log("  indicators: SSI skipped", e.message);
    }

    // Global averages for right-panel comparison
    const averages = {};
    for (const key of [
      "cinc",
      "aci",
      "gpi",
      "gti",
      "fsi",
      "ssi",
      "corpi",
      "gci",
      "hdi",
      "ghi",
    ]) {
      const vals = Object.values(ind)
        .map((r) => r[key])
        .filter((v) => v != null);
      if (vals.length)
        averages[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    const path = join(PUBDATA, "country-indicators.json");
    writeFileSync(path, JSON.stringify({ countries: ind, averages }));
    log(
      `wrote public/data/country-indicators.json  (${Object.keys(ind).length} countries)`,
    );
  },

  "cow-cinc-series.json"() {
    const cinc = readJSON(join(SRC, "cow/composite-index-of-national-capability.json"));
    const abbToIso = {};
    for (const rec of Object.values(cinc.countries ?? {})) {
      abbToIso[rec.stateabb] = rec.iso;
    }
    const rows = parseCSV(
      readFileSync(
        join(SRC, "cow/composite-index-of-national-capability-time-series.csv"),
        "utf8",
      ),
    );
    const h = rows[0];
    const ai = h.indexOf("stateabb"),
      yi = h.indexOf("year"),
      vi = h.indexOf("cinc");
    const out = {};
    for (let r = 1; r < rows.length; r++) {
      const iso = abbToIso[rows[r][ai]];
      const year = parseInt(rows[r][yi], 10);
      const v = parseFloat(rows[r][vi]);
      if (!iso || !Number.isFinite(year) || Number.isNaN(v)) continue;
      if (!out[iso]) out[iso] = [];
      out[iso].push({ year, value: v });
    }
    for (const iso of Object.keys(out)) {
      out[iso].sort((a, b) => a.year - b.year);
    }
    const path = join(PUBDATA, "cow-cinc-series.json");
    writeFileSync(path, JSON.stringify(out));
    log(`wrote public/data/cow-cinc-series.json  (${Object.keys(out).length} countries)`);
  },

  "battle-deaths.json"() {
    const rows = parseCSV(
      readFileSync(join(SRC, "battle-deaths/ucdp-battle-deaths.csv"), "utf8"),
    );
    const h = rows[0];
    const isoI = h.indexOf("iso3");
    const yearI = h.indexOf("year");
    const valI = h.indexOf("battle_deaths_best");
    const raw = {};
    for (let r = 1; r < rows.length; r++) {
      const iso = rows[r][isoI];
      const year = parseInt(rows[r][yearI], 10);
      const v = parseFloat(rows[r][valI]);
      if (!iso || !Number.isFinite(year) || Number.isNaN(v)) continue;
      if (!raw[iso]) raw[iso] = {};
      raw[iso][year] = v;
    }
    const tracked = Object.keys(raw).sort();
    const countries = {};
    const START = 1989;
    const END = 2025;
    for (const iso of tracked) {
      const series = [];
      for (let y = START; y <= END; y++) {
        series.push({ year: y, value: raw[iso][y] ?? 0 });
      }
      countries[iso] = series;
    }
    const path = join(PUBDATA, "battle-deaths.json");
    writeFileSync(path, JSON.stringify({ tracked, countries }));
    log(`wrote public/data/battle-deaths.json  (${tracked.length} countries, ${START}–${END})`);
  },

  "homicides.json"() {
    const rows = parseCSV(
      readFileSync(join(SRC, "world-bank/intentional-homicides.csv"), "utf8"),
    );
    const h = rows[0];
    const codeI = h.indexOf("Indicator Code");
    const ccI = h.indexOf("Country Code");
    const yearI = h.indexOf("Year");
    const valI = h.indexOf("Value");
    const disI = h.indexOf("Disaggregation");
    const byCode = {};
    let world = [];
    for (let r = 1; r < rows.length; r++) {
      if (rows[r][codeI] !== "VC.IHR.PSRC.P5") continue;
      const dis = rows[r][disI];
      if (dis && dis !== "total") continue;
      const cc = rows[r][ccI];
      const year = parseInt(rows[r][yearI], 10);
      const v = parseFloat(rows[r][valI]);
      if (!cc || !Number.isFinite(year) || Number.isNaN(v)) continue;
      const pt = { year, value: v };
      if (cc === "WLD") {
        world.push(pt);
      } else {
        if (!byCode[cc]) byCode[cc] = [];
        byCode[cc].push(pt);
      }
    }
    for (const k of Object.keys(byCode)) {
      byCode[k].sort((a, b) => a.year - b.year);
    }
    world.sort((a, b) => a.year - b.year);
    const path = join(PUBDATA, "homicides.json");
    writeFileSync(path, JSON.stringify({ byCode, world }));
    log(`wrote public/data/homicides.json  (${Object.keys(byCode).length} countries)`);
  },

  "imf-bop.json"() {
    const rows = parseCSV(
      readFileSync(
        join(SRC, "country-codes/macroeconomic-indicators/imf-bop.csv"),
        "utf8",
      ),
    );
    const h = rows[0];
    const seriesI = h.indexOf("SERIES_CODE");
    const scaleI = h.indexOf("SCALE");
    const yearCols = h.filter((c) => /^\d{4}$/.test(c));
    const out = {};
    for (let r = 1; r < rows.length; r++) {
      const seriesCode = rows[r][seriesI] ?? "";
      const iso = seriesCode.split(".")[0];
      if (!/^[A-Z0-9]{3}$/.test(iso) || iso.startsWith("G")) continue;
      let latestYear = null;
      let latestVal = null;
      for (const y of yearCols) {
        const raw = rows[r][h.indexOf(y)];
        if (raw == null || raw === "") continue;
        const v = parseFloat(raw);
        if (Number.isNaN(v)) continue;
        const yi = parseInt(y, 10);
        if (latestYear == null || yi >= latestYear) {
          latestYear = yi;
          latestVal = v;
        }
      }
      if (latestYear == null || latestVal == null) continue;
      const scale = rows[r][scaleI] ?? "Millions";
      const millions = scale.toLowerCase().includes("million") ? latestVal : latestVal / 1e6;
      out[iso] = {
        valueMillions: millions,
        valueUsd: millions * 1e6,
        year: latestYear,
        scale,
        unit: "USD",
      };
    }
    const path = join(PUBDATA, "imf-bop.json");
    writeFileSync(path, JSON.stringify(out));
    log(`wrote public/data/imf-bop.json  (${Object.keys(out).length} countries)`);
  },

  "worldfactbook-slugs.json"() {
    const rows = parseCSV(readFileSync(join(SRC, "country-codes/country-codes.csv"), "utf8"));
    const h = rows[0];
    const iso3I = h.indexOf("iso3");
    const slugI = h.indexOf("worldfactbook-slug");
    const map = {};
    for (let r = 1; r < rows.length; r++) {
      const iso3 = rows[r][iso3I];
      const slug = rows[r][slugI]?.trim();
      if (iso3 && slug) map[iso3] = slug;
    }
    const path = join(PUBDATA, "worldfactbook-slugs.json");
    writeFileSync(path, JSON.stringify(map));
    log(`wrote public/data/worldfactbook-slugs.json  (${Object.keys(map).length} slugs)`);
  },

  "iso-maps.json"() {
    const wbRows = parseCSV(
      readFileSync(join(SRC, "world-bank/world-bank-countries.csv"), "utf8"),
    );
    const wbH = wbRows[0];
    const iso3I = wbH.indexOf("Code");
    const iso2I = wbH.indexOf("ISO2");
    const iso3to2 = {};
    for (let r = 1; r < wbRows.length; r++) {
      const iso3 = wbRows[r][iso3I];
      const iso2 = wbRows[r][iso2I];
      if (iso3 && iso2) iso3to2[iso3] = iso2;
    }
    const bisRows = parseCSV(
      readFileSync(
        join(SRC, "country-codes/macroeconomic-indicators/bis-countries.csv"),
        "utf8",
      ),
    );
    const bisH = bisRows[0];
    const bIso2 = bisH.indexOf("iso2");
    const cbprI = bisH.indexOf("Central Bank Policy Rates");
    const creditI = bisH.indexOf("Credit-to-GDP");
    const reerI = bisH.indexOf("Effective Exchange Rate");
    const bis = {};
    for (let r = 1; r < bisRows.length; r++) {
      const iso2 = bisRows[r][bIso2];
      if (!iso2) continue;
      bis[iso2] = {
        cbpr: bisRows[r][cbprI] || null,
        credit: bisRows[r][creditI] || null,
        reer: bisRows[r][reerI] || null,
      };
    }
    const path = join(PUBDATA, "iso-maps.json");
    writeFileSync(path, JSON.stringify({ iso3to2, bis }));
    log(`wrote public/data/iso-maps.json`);
  },

  "cow-advanced-arms.json"() {
    const cinc = readJSON(join(SRC, "cow/composite-index-of-national-capability.json"));
    const abbToIso = {};
    for (const rec of Object.values(cinc.countries ?? {})) {
      abbToIso[rec.stateabb] = rec.iso;
    }
    const rows = parseCSV(
      readFileSync(join(SRC, "cow/advanced-arms-technologies.csv"), "utf8"),
    );
    const h = rows[0];
    const ai = h.indexOf("stateabb"),
      ti = h.indexOf("techname"),
      yi = h.indexOf("year"),
      ui = h.indexOf("use");
    const latest = {};
    for (let r = 1; r < rows.length; r++) {
      const abb = rows[r][ai];
      const iso = abbToIso[abb];
      const year = parseInt(rows[r][yi], 10);
      const tech = rows[r][ti];
      const use = parseInt(rows[r][ui], 10);
      if (!iso || !tech || !Number.isFinite(year)) continue;
      const k = `${iso}:${tech}`;
      if (!latest[k] || year >= latest[k].year)
        latest[k] = { iso, tech, year, use: use === 1 ? 1 : 0 };
    }
    const out = {};
    for (const v of Object.values(latest)) {
      if (!out[v.iso]) out[v.iso] = {};
      out[v.iso][v.tech] = v.use;
    }
    const path = join(PUBDATA, "cow-advanced-arms.json");
    writeFileSync(path, JSON.stringify(out));
    log(`wrote public/data/cow-advanced-arms.json  (${Object.keys(out).length} countries)`);
  },

  "water-conflicts.geojson"() {
    const text = readFileSync(
      join(SRC, "water-conflicts/water-conflicts.csv"),
      "utf8",
    );
    const rows = parseCSV(text);
    const header = rows[0];
    const idx = (name) => header.indexOf(name);
    const iLat = idx("Latitude"),
      iLon = idx("Longitude");
    const raw = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const lat = parseFloat(row[iLat]);
      const lon = parseFloat(row[iLon]);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      raw.push({
        srcLon: lon,
        srcLat: lat,
        properties: {
          Title: row[idx("Title")],
          Date: row[idx("Date")],
          Country: row[idx("Country")],
          "Conflict Type": row[idx("Conflict Type")],
          Description: (row[idx("Description")] || "").slice(0, 400),
          Sources: row[idx("Sources")],
        },
      });
    }

    const groups = new Map();
    raw.forEach((r, i) => {
      const key = `${Number(r.srcLon).toFixed(5)},${Number(r.srcLat).toFixed(5)}`;
      const g = groups.get(key);
      if (g) g.push(i);
      else groups.set(key, [i]);
    });

    const features = raw.map((r, i) => {
      const key = `${Number(r.srcLon).toFixed(5)},${Number(r.srcLat).toFixed(5)}`;
      const group = groups.get(key);
      const clusterIndex = group.indexOf(i);
      const clusterSize = group.length;
      const jittered = clusterSize > 1;
      const [lon, lat] = jittered
        ? clusterJitter(r.srcLon, r.srcLat, clusterIndex, clusterSize)
        : [r.srcLon, r.srcLat];
      return pt(lon, lat, {
        ...r.properties,
        source_longitude: r.srcLon,
        source_latitude: r.srcLat,
        cluster_size: clusterSize,
        jittered,
      });
    });
    write("water-conflicts.geojson", features);
  },

  "military-airports.geojson"() {
    const fc = readJSON(join(SRC, "airports/military-airports.geojson"));
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "name",
          "ident",
          "type",
          "iso_country",
          "municipality",
          "icao_code",
          "elevation_ft",
        ]),
      }));
    write("military-airports.geojson", features);
  },

  "rivers.geojson"() {
    const fc = readJSON(join(SRC, "rivers/rivers.geojson"));
    const features = fc.features
      .filter((f) => f.geometry && (f.properties.scalerank ?? 99) <= 6)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, ["name", "name_en", "scalerank"]),
      }));
    write("rivers.geojson", features);
  },

  "tectonic-boundaries.geojson"() {
    const fc = readJSON(
      join(SRC, "tectonic-plates/tectonic-plates-boundaries.json"),
    );
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, ["Name", "PlateA", "PlateB", "Type"]),
      }));
    write("tectonic-boundaries.geojson", features);
  },

  "navareas.geojson"() {
    const fc = readJSON(join(SRC, "nga-alerts/navareas.geojson"));
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, ["navarea", "coordinator"]),
      }));
    write("navareas.geojson", features);
  },

  "urban-areas.geojson"() {
    const fc = readJSON(join(SRC, "urban-areas/urban-areas.geojson"));
    const features = fc.features
      .filter((f) => f.geometry && (f.properties.scalerank ?? 99) <= 4)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, ["scalerank", "area_sqkm"]),
      }));
    write("urban-areas.geojson", features);
  },

  // §3.11 Plants & Factories -----------------------------------------------

  "nuclear-power-plants.geojson"() {
    const fc = readJSON(join(SRC, "gem/nuclear/nuclear-power-plants.geojson"));
    const keep = new Set(["operating", "construction"]);
    const features = fc.features
      .filter((f) => f.geometry && keep.has(f.properties["Status"]))
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "Project Name",
          "Unit Name",
          "Status",
          "Capacity (MW)",
          "Reactor Type",
          "Country/Area",
          "State/Province",
          "Owner",
          "Operator",
          "Commercial Operation Date",
          "Construction Start Date",
          "Wiki URL",
        ]),
      }));
    write("nuclear-power-plants.geojson", features);
  },

  "power-plants.geojson"() {
    const fc = readJSON(
      join(SRC, "power-plants/global-power-plants-database.geojson"),
    );
    const features = fc.features
      .filter((f) => f.geometry && (f.properties.capacity_mw ?? 0) >= 20)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "name",
          "country",
          "country_long",
          "primary_fuel",
          "capacity_mw",
          "owner",
          "commissioning_year",
        ]),
      }));
    write("power-plants.geojson", features);
  },

  "iron-steel-plants.geojson"() {
    const fc = readJSON(
      join(SRC, "gem/iron-and-steel/iron-and-steel-plants.geojson"),
    );
    const features = fc.features
      .filter(
        (f) => f.geometry && !f.properties["Retired date"],
      )
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "Plant name (English)",
          "Owner",
          "Country/area",
          "Municipality",
          "Region",
          "Start date",
          "Plant age",
        ]),
      }));
    write("iron-steel-plants.geojson", features);
  },

  // §3.13 Oil & Gas ----------------------------------------------------------

  "refineries.geojson"() {
    const fc = readJSON(
      join(
        SRC,
        "oil-and-gas-infrastructure/oil-and-gas-aggregated/crude-oil-refineries/crude-oil-refineries.geojson",
      ),
    );
    const features = fc.features
      .filter((f) => f.geometry && f.properties.status !== "inactive")
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "name",
          "country",
          "state_province",
          "status",
          "operator",
          "capacity",
          "capacity_unit",
          "source",
        ]),
      }));
    write("refineries.geojson", features);
  },

  "lng-terminals.geojson"() {
    const fc = readJSON(
      join(
        SRC,
        "oil-and-gas-infrastructure/oil-and-gas-aggregated/lng-terminals/lng-terminals.geojson",
      ),
    );
    const features = fc.features
      .filter((f) => f.geometry && f.properties.status !== "inactive")
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "name",
          "country",
          "status",
          "facility_type",
          "operator",
          "capacity",
          "capacity_unit",
          "floating",
        ]),
      }));
    write("lng-terminals.geojson", features);
  },

  "petroleum-terminals.geojson"() {
    const fc = readJSON(
      join(
        SRC,
        "oil-and-gas-infrastructure/oil-and-gas-aggregated/petroleum-terminals/petroleum-terminals-ogim.geojson",
      ),
    );
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "FAC_NAME",
          "COUNTRY",
          "STATE_PROV",
          "FAC_STATUS",
          "OPERATOR",
          "COMMODITY",
          "LIQ_CAPACITY_BPD",
          "NUM_STORAGE_TANKS",
        ]),
      }));
    write("petroleum-terminals.geojson", features);
  },

  "offshore-platforms.geojson"() {
    const fc = readJSON(
      join(
        SRC,
        "oil-and-gas-infrastructure/oil-and-gas-aggregated/offshore-platforms/offshore-platforms.geojson",
      ),
    );
    const features = fc.features
      .filter((f) => f.geometry && f.properties.status !== "removed")
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "name",
          "country",
          "status",
          "facility_type",
          "operator",
          "category",
          "floating",
          "source",
        ]),
      }));
    write("offshore-platforms.geojson", features);
  },

  "og-fields.geojson"() {
    const fc = readJSON(
      join(
        SRC,
        "oil-and-gas-infrastructure/oil-and-gas-aggregated/oil-and-gas-fields/field-level-data-gem.geojson",
      ),
    );
    const drop = new Set(["cancelled", "abandoned", "decommissioning"]);
    const features = fc.features
      .filter((f) => f.geometry && !drop.has(f.properties["Status"]))
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "Unit Name",
          "Fuel type",
          "Country/Area",
          "Production Type",
          "Status",
          "Discovery year",
          "Production start year",
          "Operator",
          "Onshore/Offshore",
          "Basin",
        ]),
      }));
    write("og-fields.geojson", features);
  },

  // §3.14 Railroads -----------------------------------------------------------

  "railroads.geojson"() {
    const fc = readJSON(join(SRC, "railroads/railroads.geojson"));
    // scalerank <= 6 keeps the trunk network (~6k of 25k segments) so the
    // GeoJSON stays streamable; full detail belongs in PMTiles if ever needed.
    const features = fc.features
      .filter((f) => f.geometry && (f.properties.scalerank ?? 99) <= 6)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, ["category", "electric", "continent", "scalerank"]),
      }));
    write("railroads.geojson", features);
  },

  "ammonia-plants.geojson"() {
    const fc = readJSON(
      join(SRC, "gem/chemicals/ammonia-producing-plants.geojson"),
    );
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "Plant name (English)",
          "Owner (English)",
          "Country/area",
          "Municipality",
          "Primary products",
          "Feedstock",
        ]),
      }));
    write("ammonia-plants.geojson", features);
  },

  // Unplanned layers (notes round 5) ----------------------------------------

  "volcanoes.geojson"() {
    const fc = readJSON(join(SRC, "volcanoes/volcanoes.geojson"));
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => {
        const p = f.properties ?? {};
        const obs = p.obsAbbr ?? "OTHER";
        return {
          type: "Feature",
          geometry: f.geometry,
          properties: {
            name: p.vName,
            gvp_number: p.vnum,
            country: p.country,
            region: p.subregion,
            elevation_m: p.elevation_m,
            monitoring: VOLCANO_OBS[obs] ?? obs,
            webpage: p.webpage,
          },
        };
      });
    write("volcanoes.geojson", features);
  },

  "historical-conflicts.geojson"() {
    const fc = readJSON(join(SRC, "cow/historical-conflicts.geojson"));
    const features = fc.features
      .filter((f) => f.geometry && f.geometry.type === "Point")
      .map((f) => {
        const p = f.properties ?? {};
        const [srcLon, srcLat] = f.geometry.coordinates;
        const idx = p.cluster_index ?? 0;
        const size = p.cluster_size ?? 1;
        const needs = !!p.needs_jitter && size > 1;
        const [lon, lat] = needs
          ? clusterJitter(srcLon, srcLat, idx, size)
          : [srcLon, srcLat];
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: pick(
            {
              ...p,
              source_longitude: srcLon,
              source_latitude: srcLat,
              jittered: needs,
            },
            [
              "year",
              "location",
              "record_type",
              "source_dataset",
              "dispute_start_year",
              "dispute_end_year",
              "hostility_level",
              "hostility_label",
              "fatalities",
              "outcome_label",
              "participants_side_a",
              "participants_side_b",
              "precision_label",
              "cluster_size",
              "jittered",
              "source_longitude",
              "source_latitude",
            ],
          ),
        };
      });
    write("historical-conflicts.geojson", features);
  },

  "og-basins.geojson"() {
    const fc = readJSON(
      join(
        SRC,
        "oil-and-gas-infrastructure/oil-and-gas-aggregated/oil-and-gas-basins/oil-and-natural-gas-basins-ogim.geojson",
      ),
    );
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: roundGeometry(f.geometry, 2),
        properties: pick(f.properties, [
          "NAME",
          "COUNTRY",
          "REGION",
          "ON_OFFSHORE",
          "AREA_KM2",
          "RESERVOIR_TYPE",
        ]),
      }));
    write("og-basins.geojson", features);
  },

  "gas-pipelines.geojson"() {
    const operating = join(
      SRC,
      "oil-and-gas-infrastructure/oil-and-gas-aggregated/oil-and-gas-pipelines/gas-pipelines-operating.geojson",
    );
    const full = join(
      SRC,
      "oil-and-gas-infrastructure/oil-and-gas-aggregated/oil-and-gas-pipelines/gas-pipelines.geojson",
    );
    const path = existsSync(operating) ? operating : full;
    const fc = readJSON(path);
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: roundGeometry(f.geometry, 1),
        properties: pick(f.properties, [
          "PipelineName",
          "SegmentName",
          "Status",
          "Fuel",
          "CountriesOrAreas",
          "Owner",
          "Wiki",
        ]),
      }));
    write("gas-pipelines.geojson", features);
  },

  "prio-diamonds.geojson"() {
    const fc = readJSON(join(SRC, "prio/diamonds.geojson"));
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: pick(f.properties, [
          "COUNTRY",
          "NAME",
          "LANDMARK",
          "LOCINFO",
          "RES",
          "RESINFO",
          "DIAINFO",
          "SIZEINFO",
          "DISC",
          "PROD",
          "OTHERINFO",
        ]),
      }));
    write("prio-diamonds.geojson", features);
  },

  "prio-gems.geojson"() {
    const GEM_COLS = [
      "RUBY", "SAPPHIRE", "EMERALD", "AQUAMARINE", "HELIODOR", "MOGANITE",
      "GOSHENITE", "NEPHRITE", "JADEITE", "LAPIS_LAZU", "OPAL", "TOURMALINE",
      "PERIODIT", "TOPAZ", "PEARL", "GARNET", "ZIRCON", "SPINEL", "AMBER", "QUARZ",
    ];
    const fc = readJSON(join(SRC, "prio/gems.geojson"));
    const features = fc.features
      .filter((f) => f.geometry)
      .map((f) => {
        const p = f.properties ?? {};
        const gemstones = GEM_COLS.filter(
          (k) => p[k] === 1 || p[k] === "1",
        )
          .map((k) => k.replace(/_/g, " "))
          .join(", ");
        return {
          type: "Feature",
          geometry: f.geometry,
          properties: {
            COUNTRY: p.COUNTRY,
            NAME: p.NAME,
            GEMSTONE: gemstones || undefined,
            MINING: p.MINING,
            DISC_Y: p.DISC_Y,
            PRO_Y: p.PRO_Y,
            COMMENT: p.COMMENT,
          },
        };
      });
    write("prio-gems.geojson", features);
  },

  "military-aircraft-registry.json"() {
    const list = readJSON(join(SRC, "aircraft/military-aircraft.json"));
    const out = {};
    for (const row of list) {
      const hex = String(row.icao24 ?? "").toLowerCase();
      if (!/^[0-9a-f]{6}$/.test(hex)) continue;
      const op = row.intelsky_operator || row.operator || row.owner;
      const reg = row.registration || row.intelsky_registration;
      const type = row.intelsky_type || row.typecode;
      const desc = row.intelsky_description
        ? String(row.intelsky_description).slice(0, 80)
        : undefined;
      const entry = pick(
        {
          c: row.country || undefined,
          o: op || undefined,
          w: row.owner || undefined,
          r: reg && reg !== "-UNKNOWN-" ? reg : undefined,
          t: type || undefined,
          m: row.military_reason || undefined,
          s: row.match_status || undefined,
          n: row.source_count != null ? row.source_count : undefined,
          d: desc,
        },
        ["c", "o", "w", "r", "t", "m", "s", "n", "d"],
      );
      out[hex] = entry;
    }
    const path = join(DATA, "military-aircraft-registry.json");
    writeFileSync(path, JSON.stringify(out));
    log(
      `wrote src/data/military-aircraft-registry.json  (${Object.keys(out).length} hex codes, ${Math.round(statSync(path).size / 1024)} KB)`,
    );
  },
};

const only = process.argv.slice(2);
// Resolve a CLI arg to a task key: accept exact name, or with .geojson/.json
// suffixes (some tasks emit .json, e.g. country-centroids / country-indicators).
const resolve = (n) =>
  [n, `${n}.geojson`, `${n}.json`].find((k) => tasks[k]) ?? `${n}.geojson`;
const names = only.length ? only.map(resolve) : Object.keys(tasks);

let ok = 0;
for (const name of names) {
  const fn = tasks[name];
  if (!fn) {
    log(`! no task for ${name}`);
    continue;
  }
  try {
    if (!existsSync(SRC)) throw new Error("static-data/ not found");
    fn();
    ok++;
  } catch (e) {
    log(`! failed ${name}: ${e.message}`);
  }
}
log(`done — ${ok}/${names.length} layers built into public/geo`);
