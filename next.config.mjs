import { readFileSync, existsSync } from "node:fs";

// Bridge secrets from .env.local and the pre-existing src/.env into the server
// runtime so API routes can read them. Never exposed to the client (no
// NEXT_PUBLIC_ prefix). Values already present in process.env win.
function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnv("./.env.local");
loadEnv("./src/.env");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // deck.gl / maplibre ship ESM that Next can transpile directly; mark large
  // geo libs as external-friendly via transpilePackages where needed.
  transpilePackages: [
    "@deck.gl/core",
    "@deck.gl/layers",
    "@deck.gl/react",
    "@deck.gl/geo-layers",
    "@deck.gl/aggregation-layers",
    "@deck.gl/mapbox",
  ],
  experimental: {
    // Allow importing the local worker bundles.
    esmExternals: true,
  },
  async headers() {
    return [
      {
        // PMTiles + static geo assets benefit from range requests + long cache.
        source: "/(geo|tiles)/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
