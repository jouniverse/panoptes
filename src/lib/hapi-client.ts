import { fetchWithTimeout } from "@/lib/http";

const MIN_GAP_MS = 450;
const MAX_RETRIES = 4;

let lastFetchAt = 0;
const inflight = new Map<string, Promise<unknown>>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = lastFetchAt + MIN_GAP_MS - now;
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();
}

/** Fetch HAPI JSON with spacing, in-flight dedup, and 429 retries. */
export async function fetchHapiJSON<T>(url: string, ms = 20_000): Promise<T> {
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const work = (async (): Promise<T> => {
    await throttle();
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetchWithTimeout(url, {}, ms);
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("Retry-After")) || (attempt + 1) * 2;
          lastErr = new Error(`HTTP 429 :: ${url}`);
          await sleep(retryAfter * 1000);
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} :: ${url}`);
        return (await res.json()) as T;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        if (lastErr.message.includes("429") && attempt < MAX_RETRIES - 1) {
          await sleep((attempt + 1) * 1500);
          continue;
        }
        throw lastErr;
      }
    }

    throw lastErr ?? new Error(`HTTP 429 :: rate limited`);
  })().finally(() => {
    inflight.delete(url);
  });

  inflight.set(url, work);
  return work;
}
