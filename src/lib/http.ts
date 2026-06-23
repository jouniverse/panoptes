export async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms = 12_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        "User-Agent": process.env.NOAA_USER_AGENT || "panoptes-osint/0.1 (research)",
        ...(opts.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} :: ${url}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJSON<T>(url: string, opts?: RequestInit, ms?: number): Promise<T> {
  const r = await fetchWithTimeout(url, opts, ms);
  return (await r.json()) as T;
}

export async function fetchText(url: string, opts?: RequestInit, ms?: number): Promise<string> {
  const r = await fetchWithTimeout(url, opts, ms);
  return await r.text();
}
