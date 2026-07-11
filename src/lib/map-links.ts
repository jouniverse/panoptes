/** External map / imagery links for a lat/lon point. */
export function openstreetmapUrl(lat: number, lon: number, zoom = 12): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}

export function googleMapsUrl(lat: number, lon: number, zoom = 12): string {
  return `https://www.google.com/maps?q=${lat},${lon}&z=${zoom}`;
}

export function imintUrl(lat: number, lon: number, zoom = 12): string {
  return `https://browser.dataspace.copernicus.eu/?zoom=${zoom}&lat=${lat}&lng=${lon}`;
}

export function openLocationUrl(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
