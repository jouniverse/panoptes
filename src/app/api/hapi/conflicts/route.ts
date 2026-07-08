import { NextResponse } from "next/server";
import { fetchHapiJSON } from "@/lib/hapi-client";
import { cacheGet, cacheSet } from "@/lib/cache";
import { cacheTtl } from "@/config/cache-schedule";

const HAPI_BASE = process.env.HAPI_BASE_URL ?? "https://hapi.humdata.org/api/v2";

/** ACLED categories returned by HAPI (underscore form). */
const ALLOWED_TYPES = new Set(["civilian_targeting", "demonstration", "political_violence"]);

const TYPE_LABELS: Record<string, string> = {
  civilian_targeting: "Civilian targeting",
  demonstration: "Demonstration",
  political_violence: "Political violence",
};

export interface ConflictTypeSummary {
  type: string;
  label: string;
  events: number;
  fatalities: number;
}

export interface ConflictDetailRow {
  eventType: string;
  periodStart?: string;
  periodEnd?: string;
  admin1?: string;
  events: number;
  fatalities: number;
}

interface HapiRow {
  event_type?: string;
  events?: number;
  fatalities?: number;
  reference_period_start?: string;
  reference_period_end?: string;
  admin1_name?: string;
  admin2_name?: string;
}

function rollingYearRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { start: fmt(start), end: fmt(end) };
}

function normType(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseRows(json: unknown): HapiRow[] {
  if (!json || typeof json !== "object") return [];
  const root = json as Record<string, unknown>;
  const data = root.data;
  if (Array.isArray(data)) return data as HapiRow[];
  if (data && typeof data === "object") {
    const block = data as Record<string, unknown>;
    if (Array.isArray(block.rows)) {
      const rows = block.rows as unknown[];
      const cols = block.columns as string[] | undefined;
      if (cols && rows.length && Array.isArray(rows[0])) {
        return rows.map((row) => {
          const arr = row as unknown[];
          const obj: Record<string, unknown> = {};
          cols.forEach((c, i) => {
            obj[c] = arr[i];
          });
          return obj as HapiRow;
        });
      }
      return rows as HapiRow[];
    }
  }
  return [];
}

export async function GET(req: Request) {
  const iso = new URL(req.url).searchParams.get("iso")?.trim().toUpperCase();
  if (!iso || !/^[A-Z]{3}$/.test(iso)) {
    return NextResponse.json({ error: "iso query param required" }, { status: 400 });
  }

  const appId =
    process.env.HAPI_APP_IDENTIFIER ||
    process.env.HDX_APP_IDENTIFIER ||
    process.env.HDX_HAPI_APP_IDENTIFIER;

  if (!appId) {
    return NextResponse.json(
      { iso, error: "HAPI_APP_IDENTIFIER or HDX_APP_IDENTIFIER required in .env" },
      { status: 503 },
    );
  }

  const ttl = cacheTtl("hdx:hapi:conflicts");
  const cacheKey = `hapi:conflicts:v2:${iso}`;
  const cached = cacheGet<{
    byType: ConflictTypeSummary[];
    details: ConflictDetailRow[];
    startDate: string;
    endDate: string;
    totalEvents: number;
  }>(cacheKey);

  if (cached && cached.age < ttl) {
    return NextResponse.json({ iso, ...cached.data });
  }

  const { start, end } = rollingYearRange();

  try {
    const params = new URLSearchParams({
      app_identifier: appId,
      start_date: start,
      end_date: end,
      location_code: iso,
      output_format: "json",
      limit: "10000",
      offset: "0",
    });
    const url = `${HAPI_BASE}/coordination-context/conflict-events?${params}`;
    const json = await fetchHapiJSON<unknown>(url, 20_000);
    const rows = parseRows(json).filter((r) => {
      const t = r.event_type ? normType(r.event_type) : "";
      return ALLOWED_TYPES.has(t);
    });

    const byTypeMap = new Map<string, ConflictTypeSummary>();
    for (const t of ALLOWED_TYPES) {
      byTypeMap.set(t, {
        type: t,
        label: TYPE_LABELS[t] ?? t,
        events: 0,
        fatalities: 0,
      });
    }

    const details: ConflictDetailRow[] = [];

    for (const r of rows) {
      const t = normType(r.event_type ?? "");
      if (!ALLOWED_TYPES.has(t)) continue;
      const events = Number(r.events) || 0;
      const fatalities = Number(r.fatalities) || 0;
      const sum = byTypeMap.get(t)!;
      sum.events += events;
      sum.fatalities += fatalities;
      details.push({
        eventType: TYPE_LABELS[t] ?? t,
        periodStart: r.reference_period_start,
        periodEnd: r.reference_period_end,
        admin1: r.admin1_name ?? r.admin2_name,
        events,
        fatalities,
      });
    }

    const byType = [...byTypeMap.values()];
    const totalEvents = byType.reduce((n, x) => n + x.events, 0);

    details.sort((a, b) => (b.periodStart ?? "").localeCompare(a.periodStart ?? ""));

    const result = { byType, details, startDate: start, endDate: end, totalEvents };
    cacheSet(cacheKey, result);
    return NextResponse.json({ iso, ...result });
  } catch (e) {
    if (cached) return NextResponse.json({ iso, ...cached.data, stale: true });
    const msg = String(e).slice(0, 160);
    const rateLimited = msg.includes("429");
    return NextResponse.json(
      {
        iso,
        error: rateLimited
          ? "HDX HAPI rate limit — wait a moment and refresh (or browse fewer countries in quick succession)"
          : msg,
        byType: [],
        details: [],
        totalEvents: 0,
      },
      { status: rateLimited ? 429 : 502 },
    );
  }
}
