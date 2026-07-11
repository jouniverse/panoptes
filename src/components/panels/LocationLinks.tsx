"use client";

import { TacticalButton } from "@/components/ui/primitives";
import {
  googleMapsUrl,
  imintUrl,
  openLocationUrl,
  openstreetmapUrl,
} from "@/lib/map-links";

interface LocationLinksProps {
  lat: number;
  lon: number;
  className?: string;
}

export function LocationLinks({ lat, lon, className }: LocationLinksProps) {
  return (
    <div className={`flex gap-2 ${className ?? ""}`}>
      <TacticalButton className="flex-1" onClick={() => openLocationUrl(openstreetmapUrl(lat, lon))}>
        OPEN OSM
      </TacticalButton>
      <TacticalButton className="flex-1" onClick={() => openLocationUrl(googleMapsUrl(lat, lon))}>
        GOOGLE MAPS
      </TacticalButton>
      <TacticalButton className="flex-1" onClick={() => openLocationUrl(imintUrl(lat, lon))}>
        IMINT
      </TacticalButton>
    </div>
  );
}
