import { NextResponse } from "next/server";
import { fetchJSON } from "@/lib/http";
import { cacheGet, cacheSet } from "@/lib/cache";

interface PlanespottersPhoto {
  id?: string;
  thumbnail?: { src?: string; size?: { width?: number; height?: number } };
  link?: string;
  photographer?: string;
}

interface PlanespottersResponse {
  photos?: PlanespottersPhoto[];
}

const TTL_MS = 24 * 60 * 60_000;

export async function GET(req: Request) {
  const hex = new URL(req.url).searchParams.get("hex")?.trim().toLowerCase();
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) {
    return NextResponse.json({ error: "hex query param required (6-char ICAO24)" }, { status: 400 });
  }

  const cacheKey = `aircraft-photo:${hex}`;
  const cached = cacheGet<{ url?: string; link?: string; photographer?: string } | null>(cacheKey);
  if (cached && cached.age < TTL_MS) {
    return NextResponse.json({ hex, ...cached.data });
  }

  try {
    const url = `https://api.planespotters.net/pub/photos/hex/${hex}`;
    const json = await fetchJSON<PlanespottersResponse>(url, {}, 10_000);
    const photo = json.photos?.[0];
    const result = photo
      ? {
          url: photo.thumbnail?.src,
          link: photo.link,
          photographer: photo.photographer,
        }
      : null;
    cacheSet(cacheKey, result);
    return NextResponse.json({ hex, ...result });
  } catch {
    cacheSet(cacheKey, null);
    return NextResponse.json({ hex, url: undefined });
  }
}
