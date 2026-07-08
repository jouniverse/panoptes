import { NextResponse } from "next/server";
import { factbookForIso } from "@/lib/worldfactbook";

export const maxDuration = 25;

export async function GET(req: Request) {
  const iso = new URL(req.url).searchParams.get("iso")?.trim().toUpperCase();
  if (!iso || !/^[A-Z]{3}$/.test(iso)) {
    return NextResponse.json({ error: "iso query param required" }, { status: 400 });
  }

  const profile = await factbookForIso(iso);
  if (!profile) {
    return NextResponse.json({ iso, error: "No World Factbook profile" }, { status: 404 });
  }
  return NextResponse.json({ iso, ...profile });
}
