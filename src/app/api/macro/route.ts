import { NextResponse } from "next/server";
import { bisMacroForIso3 } from "@/lib/bis-macro";
import { imfBopFor } from "@/lib/static-data";

export const maxDuration = 30;

export async function GET(req: Request) {
  const iso = new URL(req.url).searchParams.get("iso")?.trim().toUpperCase();
  if (!iso || !/^[A-Z]{3}$/.test(iso)) {
    return NextResponse.json({ error: "iso query param required" }, { status: 400 });
  }

  try {
    const [bis, bop] = await Promise.all([bisMacroForIso3(iso), Promise.resolve(imfBopFor(iso))]);
    return NextResponse.json({ iso, bis, bop });
  } catch (e) {
    return NextResponse.json(
      { iso, error: String(e).slice(0, 120), bis: {}, bop: null },
      { status: 502 },
    );
  }
}
