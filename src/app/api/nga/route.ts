import { NextResponse } from "next/server";

/** @deprecated Use GET /api/maritime-alerts instead (live NGA DailyMem bulletins). */
export async function GET() {
  return NextResponse.json(
    {
      error: "Deprecated — use /api/maritime-alerts",
      warnings: [],
    },
    { status: 410, headers: { "X-Panoptes-Health": "offline" } },
  );
}
