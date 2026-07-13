import { fetchJSON } from "@/lib/http";

export interface SwpcAlert {
  message?: string;
  issue_datetime?: string;
  message_type?: string;
}

export interface SwpcForecastPoint {
  time: string;
  value: number;
}

export interface SpaceWeatherPayload {
  kp: number | null;
  kpTime?: string;
  alerts: { title: string; time?: string; message: string }[];
  ap: SwpcForecastPoint[];
  f107: SwpcForecastPoint[];
}

function kpColor(kp: number): string {
  if (kp >= 6) return "var(--color-alert)";
  if (kp >= 4) return "var(--color-gold)";
  return "var(--color-friendly)";
}

export function kpHint(kp: number): string {
  if (kp >= 8) return "Extreme storm — aurora at low latitudes";
  if (kp >= 5) return "Storm — aurora may reach mid-latitudes";
  if (kp >= 3) return "Active — aurora at high latitudes";
  return "Quiet — aurora mostly polar";
}

export { kpColor };

interface KpJsonRow {
  time_tag: string;
  Kp: number;
}

function parseKp(kpRaw: unknown): { kp: number | null; kpTime?: string } {
  if (!Array.isArray(kpRaw) || !kpRaw.length) return { kp: null };

  const last = kpRaw[kpRaw.length - 1];
  if (last && typeof last === "object" && "Kp" in last) {
    const row = last as KpJsonRow;
    const val = Number(row.Kp);
    if (Number.isFinite(val)) return { kp: val, kpTime: row.time_tag };
  }

  // Legacy CSV-style fallback: [["time_tag","Kp"], ...]
  if (Array.isArray(last) && last.length >= 2) {
    const val = parseFloat(String(last[1]));
    if (Number.isFinite(val)) return { kp: val, kpTime: String(last[0]) };
  }

  return { kp: null };
}

function buildForecastSeries(
  rows: { time: string; metric: string; value: number }[],
): { ap: SwpcForecastPoint[]; f107: SwpcForecastPoint[] } {
  const byDate = new Map<string, { ap?: number; f107?: number }>();
  for (const row of rows) {
    const d = row.time.slice(0, 10);
    const entry = byDate.get(d) ?? {};
    if (row.metric === "ap") entry.ap = row.value;
    if (row.metric === "f107") entry.f107 = row.value;
    byDate.set(d, entry);
  }
  const dates = [...byDate.keys()].sort();
  const ap: SwpcForecastPoint[] = [];
  const f107: SwpcForecastPoint[] = [];
  for (const d of dates) {
    const e = byDate.get(d)!;
    if (e.ap != null) ap.push({ time: d, value: e.ap });
    if (e.f107 != null) f107.push({ time: d, value: e.f107 });
  }
  return { ap, f107 };
}

export async function loadSpaceWeather(): Promise<SpaceWeatherPayload> {
  const [alertsRaw, forecastRaw, kpRaw] = await Promise.all([
    fetchJSON<SwpcAlert[]>("https://services.swpc.noaa.gov/products/alerts.json", {}, 15_000),
    fetchJSON<{ data?: { time: string; metric: string; value: number }[] }>(
      "https://services.swpc.noaa.gov/json/45-day-forecast.json",
      {},
      15_000,
    ),
    fetchJSON<unknown>(
      "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
      {},
      15_000,
    ),
  ]);

  const alerts = (alertsRaw ?? []).map((a) => {
    const message = String(a.message ?? a.message_type ?? "Alert");
    const title = message.split("\n")[0]?.trim().slice(0, 120) || "SWPC Alert";
    return { title, time: a.issue_datetime, message };
  });

  const { ap, f107 } = buildForecastSeries(forecastRaw?.data ?? []);
  const { kp, kpTime } = parseKp(kpRaw);

  return { kp, kpTime, alerts, ap, f107 };
}
