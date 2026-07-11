import http from "node:http";
import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import { normalizeAisMessage } from "./aisParser.mjs";
import { loadClassifiers, classifyVessel } from "./classify.mjs";
import { loadEnv } from "../load-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");

loadEnv(REPO_ROOT);

const AIS_URL = "wss://stream.aisstream.io/v0/stream";
const PORT = Number(process.env.AIS_RELAY_PORT || process.env.PORT) || 8787;
const API_KEY = process.env.AIS_STREAM_KEY;

const WORLD_BBOX = [
  [90, -180],
  [-90, 180],
];

const PER_MMSI_MIN_MS = 220;
const BATCH_INTERVAL_MS = 500;
const STALE_MS = 15 * 60_000;

if (!API_KEY) {
  console.error("Missing AIS_STREAM_KEY in src/.env (see .env.example)");
  process.exit(1);
}

const classifiers = loadClassifiers(REPO_ROOT);

/** @type {import('ws').WebSocket | null} */
let upstream = null;
let reconnectTimer = null;
let reconnectAttempt = 0;

/** @type {Set<import('ws').WebSocket>} */
const browserClients = new Set();

/** @type {Map<string, number>} */
const lastAcceptedAt = new Map();

/** @type {Map<string, Record<string, unknown>>} */
const vesselMap = new Map();

/** @type {Map<string, Record<string, unknown>>} */
const dirtyVessels = new Map();

function buildSubscription() {
  return {
    Apikey: API_KEY,
    BoundingBoxes: [WORLD_BBOX],
  };
}

function broadcastObj(obj) {
  const json = JSON.stringify(obj);
  for (const client of browserClients) {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  }
}

function flushBatch() {
  if (dirtyVessels.size === 0) return;
  const vessels = Array.from(dirtyVessels.values());
  dirtyVessels.clear();
  broadcastObj({ type: "batch", vessels });
}

function sendSnapshot(socket) {
  if (vesselMap.size === 0) return;
  const CHUNK = 2000;
  const all = Array.from(vesselMap.values());
  for (let i = 0; i < all.length; i += CHUNK) {
    socket.send(JSON.stringify({ type: "batch", vessels: all.slice(i, i + CHUNK) }));
  }
}

function strip(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function pruneStale() {
  const now = Date.now();
  for (const [mmsi, v] of vesselMap) {
    const updatedAt = typeof v.updatedAt === "number" ? v.updatedAt : 0;
    if (now - updatedAt > STALE_MS) {
      vesselMap.delete(mmsi);
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(30_000, 1000 * 2 ** reconnectAttempt);
  reconnectAttempt++;
  broadcastObj({ type: "status", upstream: "reconnecting", error: `reconnect in ${delay}ms` });
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectUpstream();
  }, delay);
}

/** @param {string | Buffer | ArrayBuffer | ArrayBufferView} data */
function upstreamPayloadToString(data) {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  return String(data);
}

function connectUpstream() {
  if (upstream && upstream.readyState === WebSocket.OPEN) return;

  upstream = new WebSocket(AIS_URL);

  upstream.on("open", () => {
    reconnectAttempt = 0;
    upstream?.send(JSON.stringify(buildSubscription()));
    broadcastObj({ type: "status", upstream: "connected" });
    console.log("[ais-relay] upstream connected");
  });

  upstream.on("message", (data) => {
    let raw;
    try {
      raw = JSON.parse(upstreamPayloadToString(data));
    } catch {
      return;
    }

    const normalized = normalizeAisMessage(raw);
    if (!normalized || !normalized.mmsi) return;

    const classified = classifyVessel(normalized, classifiers);
    if (!classified) return;

    const now = Date.now();
    const mmsi = String(classified.mmsi);
    const last = lastAcceptedAt.get(mmsi) ?? 0;
    if (now - last < PER_MMSI_MIN_MS) return;
    lastAcceptedAt.set(mmsi, now);

    const prev = vesselMap.get(mmsi);
    const merged = prev ? { ...prev, ...strip(classified) } : classified;
    vesselMap.set(mmsi, merged);
    dirtyVessels.set(mmsi, merged);
  });

  upstream.on("close", () => {
    broadcastObj({ type: "status", upstream: "disconnected" });
    upstream = null;
    scheduleReconnect();
  });

  upstream.on("error", (err) => {
    console.error("[ais-relay] upstream error:", err.message);
  });
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(`Panoptes AIS relay — WebSocket /ws — ${vesselMap.size} vessels\n`);
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  browserClients.add(socket);
  socket.send(
    JSON.stringify({
      type: "status",
      upstream:
        upstream && upstream.readyState === WebSocket.OPEN ? "connected" : "disconnected",
    }),
  );
  sendSnapshot(socket);

  socket.on("message", (buf) => {
    try {
      const msg = JSON.parse(buf.toString());
      if (msg?.type === "ping") socket.send(JSON.stringify({ type: "pong" }));
    } catch {
      /* ignore */
    }
  });

  socket.on("close", () => browserClients.delete(socket));
});

server.on("error", (err) => {
  if (/** @type {NodeJS.ErrnoException} */ (err).code === "EADDRINUSE") {
    console.error(`Port ${PORT} in use — stop the other process and retry.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`AIS relay listening on http://127.0.0.1:${PORT} (WS /ws)`);
  connectUpstream();
  setInterval(flushBatch, BATCH_INTERVAL_MS);
  setInterval(pruneStale, 60_000);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
