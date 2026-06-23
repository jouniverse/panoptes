// Per-provider circuit breaker. After repeated upstream failures the breaker
// "opens" for a cooldown so one bad API cannot hammer the server or stall the
// whole dashboard (failure isolation per the integration guidance).

interface Breaker {
  failures: number;
  openUntil: number;
}

const breakers = new Map<string, Breaker>();
const THRESHOLD = 4;
const COOLDOWN_MS = 60_000;

export function canRequest(key: string): boolean {
  const b = breakers.get(key);
  if (!b) return true;
  return Date.now() >= b.openUntil;
}

export function recordSuccess(key: string): void {
  breakers.delete(key);
}

export function recordFailure(key: string): void {
  const b = breakers.get(key) ?? { failures: 0, openUntil: 0 };
  b.failures += 1;
  if (b.failures >= THRESHOLD) {
    b.openUntil = Date.now() + COOLDOWN_MS;
    b.failures = 0;
  }
  breakers.set(key, b);
}
