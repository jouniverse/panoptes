// Simple in-memory TTL cache for server route handlers. Survives across
// requests within a warm serverless instance. Falls back gracefully; an
// Upstash Redis adapter can be layered in later via the same interface.

interface Entry<T> {
  data: T;
  ts: number;
}

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): { data: T; age: number } | null {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return null;
  return { data: e.data, age: Date.now() - e.ts };
}

export function cacheSet<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() });
  // crude memory bound — country profiles generate many keys
  if (store.size > 256) {
    const oldest = [...store.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) store.delete(oldest[0]);
  }
}
