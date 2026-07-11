#!/usr/bin/env node
/**
 * Validates point-layer marker assignments in layer-registry.ts.
 * Fails on identical (marker, hex) pairs; warns on cluster hue collisions
 * and same-shape pairs with RGB distance < 100.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(ROOT, "src/config/layer-registry.ts");
const PALETTE = join(ROOT, "src/config/marker-palette.ts");

const DIST_WARN = 100;

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function markerHueDistance(a, b) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function loadMarkerHues() {
  const src = readFileSync(PALETTE, "utf8");
  const hues = {};
  for (const m of src.matchAll(/^\s+(\w+):\s+"(#[0-9a-fA-F]{6})"/gm)) {
    hues[m[1]] = m[2].toLowerCase();
  }
  return hues;
}

const THEME_PALETTE = {
  intel: "#00d1ff",
  intelSoft: "#a4e6ff",
  alert: "#ff4b2b",
  gold: "#ffc700",
  friendly: "#00ff41",
  outline: "#859399",
};

function resolveColor(token, hues) {
  if (token.startsWith('"#')) return token.slice(1, -1).toLowerCase();
  if (token.startsWith("M.")) return hues[token.slice(2)] ?? token;
  if (token.startsWith("PALETTE.")) {
    const key = token.slice(8);
    return THEME_PALETTE[key] ?? token;
  }
  return token;
}

function parsePointLayers(src) {
  const layers = [];
  const blocks = src.split(/\n  \{\n/);
  for (const block of blocks) {
    const id = block.match(/id: "([^"]+)"/)?.[1];
    if (!id || !/kind: "point"/.test(block)) continue;
    const marker = block.match(/marker: "([^"]+)"/)?.[1];
    const colorToken = block.match(/color: (M\.\w+|PALETTE\.\w+|"#[^"]+")/)?.[1];
    if (!marker || !colorToken) {
      console.error(`Missing marker/color for point layer: ${id}`);
      process.exit(1);
    }
    layers.push({ id, marker, colorToken });
  }
  return layers;
}

const hues = loadMarkerHues();
const registry = readFileSync(REGISTRY, "utf8");
const layers = parsePointLayers(registry).map((l) => ({
  ...l,
  hex: resolveColor(l.colorToken, hues),
}));

let errors = 0;
let warnings = 0;

const byMarkerHex = new Map();
for (const l of layers) {
  const key = `${l.marker}|${l.hex}`;
  const prev = byMarkerHex.get(key);
  if (prev) {
    console.error(`ERROR: identical marker+color: ${prev.id} & ${l.id} (${l.marker}, ${l.hex})`);
    errors++;
  } else {
    byMarkerHex.set(key, l);
  }
}

const byHex = new Map();
for (const l of layers) {
  const ids = byHex.get(l.hex) ?? [];
  ids.push(l.id);
  byHex.set(l.hex, ids);
}
for (const [hex, ids] of byHex) {
  if (ids.length > 1) {
    console.warn(`WARN: cluster hue collision (${hex}): ${ids.join(", ")}`);
    warnings++;
  }
}

for (let i = 0; i < layers.length; i++) {
  for (let j = i + 1; j < layers.length; j++) {
    const a = layers[i];
    const b = layers[j];
    if (a.marker !== b.marker) continue;
    const dist = markerHueDistance(a.hex, b.hex);
    if (dist < DIST_WARN) {
      console.warn(
        `WARN: same shape "${a.marker}" RGB dist ${dist.toFixed(0)} < ${DIST_WARN}: ${a.id} (${a.hex}) vs ${b.id} (${b.hex})`,
      );
      warnings++;
    }
  }
}

console.log(`\nValidated ${layers.length} point layers (${errors} errors, ${warnings} warnings)\n`);
console.log("| Layer | Shape | Hex |");
console.log("| --- | --- | --- |");
for (const l of layers.sort((a, b) => a.id.localeCompare(b.id))) {
  console.log(`| \`${l.id}\` | ${l.marker} | \`${l.hex}\` |`);
}

if (errors > 0) process.exit(1);
process.exit(0);
