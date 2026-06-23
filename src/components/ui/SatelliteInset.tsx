"use client";

/**
 * A small satellite-imagery inset for the entity detail card. Uses Esri World
 * Imagery tiles (free, token-less) — a single tile centred on the target,
 * matching the "zoomed-in satellite view" called for in the design notes.
 */
function lonLatToTile(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y, z };
}

export function SatelliteInset({
  lat,
  lon,
  zoom = 12,
}: {
  lat: number;
  lon: number;
  zoom?: number;
}) {
  if (Math.abs(lat) > 85) return null;
  const { x, y, z } = lonLatToTile(lon, lat, zoom);
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  return (
    <div className="relative mt-3 h-32 overflow-hidden border border-[var(--color-outline-variant)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="satellite inset"
        className="h-full w-full object-cover opacity-90"
        style={{ filter: "saturate(0.8) contrast(1.05)" }}
      />
      <div className="pointer-events-none absolute inset-0">
        <span className="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-[var(--color-gold)]" />
        <span className="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-[var(--color-gold)]" />
        <span className="label-caps absolute bottom-1 left-1 bg-[rgba(0,0,0,0.6)] px-1 text-[var(--color-intel)]">
          IMINT // EsriWorldImagery
        </span>
      </div>
    </div>
  );
}
