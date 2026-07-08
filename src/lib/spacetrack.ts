/**
 * Space-Track.org GP/TLE client (authoritative NORAD catalog).
 * ToS: proxy server-side only — do not expose bulk raw TLE dumps to anonymous clients.
 * Rate limit: ~30 req/min — throttle to 2s between requests.
 */

const BASE_URL = "https://www.space-track.org";
const AUTH_URL = `${BASE_URL}/ajaxauth/login`;

let sessionCookie: string | null = null;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 2_000;

function credentials(): { user: string; pass: string } {
  const user = process.env.SPACETRACK_USER;
  const pass = process.env.SPACETRACK_PASS;
  if (!user || !pass) {
    throw new Error("SPACETRACK_USER and SPACETRACK_PASS must be set");
  }
  return { user, pass };
}

export function hasSpaceTrackCredentials(): boolean {
  return !!(process.env.SPACETRACK_USER && process.env.SPACETRACK_PASS);
}

async function throttle(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function authenticate(): Promise<void> {
  const { user, pass } = credentials();
  const res = await fetch(AUTH_URL, {
    method: "POST",
    body: new URLSearchParams({ identity: user, password: pass }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    redirect: "manual",
  });

  const cookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [];
  sessionCookie = cookies.map((c) => c.split(";")[0]).join("; ");

  if (!sessionCookie) {
    throw new Error("Space-Track authentication failed — no session cookie");
  }
}

async function apiRequest(url: string, retries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    if (!sessionCookie) await authenticate();
    await throttle();

    try {
      const res = await fetch(url, { headers: { Cookie: sessionCookie! } });

      if (res.status === 401 || res.status === 403) {
        sessionCookie = null;
        continue;
      }

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "60", 10);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (!res.ok) {
        throw new Error(`Space-Track HTTP ${res.status} ${res.statusText}`);
      }

      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error("Space-Track request failed after retries");
}

export interface SpaceTrackGpRow {
  NORAD_CAT_ID: string;
  OBJECT_NAME?: string;
  TLE_LINE1: string;
  TLE_LINE2: string;
}

/** All active GP records — single request, filter client-side for UCS gov/mil list. */
export async function fetchActiveGpRecords(): Promise<SpaceTrackGpRow[]> {
  const url = `${BASE_URL}/basicspacedata/query/class/gp/decay_date/null-val/format/json`;
  const res = await apiRequest(url);
  const data = (await res.json()) as SpaceTrackGpRow[];
  if (!Array.isArray(data)) throw new Error("Space-Track GP response is not an array");
  return data;
}
