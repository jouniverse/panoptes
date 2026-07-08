#!/usr/bin/env node
/**
 * Prefetch World Bank Data360 + World Factbook profiles into public/data/.
 * Run: npm run analytics:cache  (or node scripts/fetch-analytics-cache.mjs)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "static-data");
const PUB = join(ROOT, "public", "data");
mkdirSync(PUB, { recursive: true });

const log = (...a) => console.log("[analytics-cache]", ...a);

const D360_BASE = "https://data360api.worldbank.org/data360/data";
const D360_INDICATORS = {
  gdp: "WB_WDI_NY_GDP_MKTP_CD",
  population: "WB_WDI_SP_POP_TOTL",
  milExp: "WB_WDI_MS_MIL_XPND_CD",
  milExpPctGdp: "WB_WDI_MS_MIL_XPND_GD_ZS",
  personnel: "WB_WDI_MS_MIL_TOTL_P1",
  gdpGrowth: "WB_WDI_NY_GDP_MKTP_KD_ZG",
  inflation: "WB_WDI_FP_CPI_TOTL_ZG",
  currentAccount: "WB_WDI_BN_CAB_XOKA_GD_ZS",
  armsImports: "WB_WDI_MS_MIL_MPRT_KD",
  armsExports: "WB_WDI_MS_MIL_XPRT_KD",
};
const INDICATOR_BY_CODE = Object.fromEntries(
  Object.entries(D360_INDICATORS).map(([k, v]) => [v, k]),
);

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function loadIsoList() {
  const text = readFileSync(join(SRC, "world-bank/world-bank-countries.csv"), "utf8");
  return text
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(",")[0]?.trim())
    .filter((c) => c && /^[A-Z]{3}$/.test(c));
}

function loadSlugMap() {
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
  return map;
}

async function fetchJson(url, ms = 45_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "panoptes-osint/0.1 (research)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchD360Batch(isos) {
  const all = [];
  let skip = 0;
  while (true) {
    const params = new URLSearchParams({
      DATABASE_ID: "WB_WDI",
      INDICATOR: Object.values(D360_INDICATORS).join(","),
      REF_AREA: isos.join(","),
      timePeriodFrom: "1996",
      timePeriodTo: "2026",
      skip: String(skip),
    });
    const json = await fetchJson(`${D360_BASE}?${params}`);
    const rows = json.value ?? [];
    all.push(...rows);
    const total = json.count ?? rows.length;
    skip += rows.length;
    if (rows.length === 0 || skip >= total) break;
  }
  return all;
}

function mergeD360Rows(out, rows) {
  for (const row of rows) {
    const key = INDICATOR_BY_CODE[row.INDICATOR];
    if (!key) continue;
    const year = parseInt(row.TIME_PERIOD, 10);
    const value = parseFloat(row.OBS_VALUE);
    const iso = row.REF_AREA;
    if (!iso || !Number.isFinite(year) || Number.isNaN(value)) continue;
    if (!out[iso]) out[iso] = {};
    if (!out[iso][key]) out[iso][key] = [];
    out[iso][key].push({ year, value });
  }
}

function latest(series) {
  return series?.length ? series[series.length - 1] : undefined;
}

function buildWbPayload(raw) {
  const countries = {};
  for (const [iso, indicators] of Object.entries(raw)) {
    for (const k of Object.keys(indicators)) {
      indicators[k].sort((a, b) => a.year - b.year);
    }
    const milExp = indicators.milExp ?? [];
    const milExpPctGdp = indicators.milExpPctGdp ?? [];
    countries[iso] = {
      latest: {
        gdp: latest(indicators.gdp)?.value,
        gdpYear: latest(indicators.gdp)?.year,
        population: latest(indicators.population)?.value,
        populationYear: latest(indicators.population)?.year,
        milExp: latest(indicators.milExp)?.value,
        milExpYear: latest(indicators.milExp)?.year,
        milExpPctGdp: latest(indicators.milExpPctGdp)?.value,
        milExpPctGdpYear: latest(indicators.milExpPctGdp)?.year,
        personnel: latest(indicators.personnel)?.value,
        personnelYear: latest(indicators.personnel)?.year,
        gdpGrowth: latest(indicators.gdpGrowth)?.value,
        inflation: latest(indicators.inflation)?.value,
        currentAccount: latest(indicators.currentAccount)?.value,
        armsImports: latest(indicators.armsImports)?.value,
        armsImportsYear: latest(indicators.armsImports)?.year,
        armsExports: latest(indicators.armsExports)?.value,
        armsExportsYear: latest(indicators.armsExports)?.year,
      },
      series: { milExp, milExpPctGdp },
      raw: indicators,
    };
  }
  return countries;
}

function stripHtml(s) {
  return (s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function fieldText(obj) {
  if (!obj) return undefined;
  if (typeof obj === "string") return stripHtml(obj);
  if (obj.text) return stripHtml(String(obj.text));
  return undefined;
}

function extractFactbook(json) {
  const geo = json.geography ?? {};
  const econ = json.economy ?? {};
  return {
    naturalResources: fieldText(geo["Natural resources"]),
    industries: fieldText(econ.Industries),
    exportsCommodities: fieldText(econ["Exports - commodities"]),
    importsCommodities: fieldText(econ["Imports - commodities"]),
  };
}

async function fetchFactbook(slug) {
  const json = await fetchJson(`https://worldfactbook.io/api/v1/countries/${slug}/`, 20_000);
  return extractFactbook(json);
}

async function main() {
  // --- World Bank Data360 ---
  log("Fetching Data360 (World Bank WDI)…");
  const isos = loadIsoList();
  const raw = {};
  const BATCH = 25;
  for (let i = 0; i < isos.length; i += BATCH) {
    const batch = isos.slice(i, i + BATCH);
    log(`  batch ${i / BATCH + 1}/${Math.ceil(isos.length / BATCH)} (${batch.length} countries)`);
    const rows = await fetchD360Batch(batch);
    mergeD360Rows(raw, rows);
  }
  const countries = buildWbPayload(raw);
  const wbPath = join(PUB, "wb-country-indicators.json");
  writeFileSync(
    wbPath,
    JSON.stringify({ builtAt: new Date().toISOString(), source: "data360", countries }),
  );
  log(`wrote ${wbPath} (${Object.keys(countries).length} countries)`);

  for (const test of ["USA", "FIN", "EGY", "CHN"]) {
    const c = countries[test];
    if (!c) {
      log(`  ${test}: missing`);
      continue;
    }
    const l = c.latest;
    log(
      `  ${test}: pop=${l.population ?? "—"} milExpPctGdp=${l.milExpPctGdp ?? "—"} personnel=${l.personnel ?? "—"}`,
    );
  }

  // --- World Factbook slugs ---
  const slugMap = loadSlugMap();
  writeFileSync(join(PUB, "worldfactbook-slugs.json"), JSON.stringify(slugMap));
  log(`wrote worldfactbook-slugs.json (${Object.keys(slugMap).length} slugs)`);

  // --- World Factbook profiles (all slugs with rate limit) ---
  log("Fetching World Factbook profiles…");
  const profiles = {};
  const slugs = Object.entries(slugMap);
  let ok = 0;
  for (let i = 0; i < slugs.length; i++) {
    const [iso3, slug] = slugs[i];
    try {
      profiles[iso3] = await fetchFactbook(slug);
      ok++;
      if ((i + 1) % 25 === 0) log(`  ${i + 1}/${slugs.length}`);
    } catch (e) {
      log(`  skip ${iso3} (${slug}): ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  writeFileSync(
    join(PUB, "worldfactbook-profiles.json"),
    JSON.stringify({ builtAt: new Date().toISOString(), profiles }),
  );
  log(`wrote worldfactbook-profiles.json (${ok}/${slugs.length} countries)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
