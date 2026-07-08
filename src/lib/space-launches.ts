export interface SpaceLaunchItem {
  id: string;
  name: string;
  last_updated?: string;
  window_start?: string;
  window_end?: string;
  provider?: string;
  provider_type?: string;
  rocket_name?: string;
  rocket_family?: string;
  rocket_full_name?: string;
  mission_name?: string;
  mission_description?: string;
  mission_type?: string;
  orbit_name?: string;
  orbit_abbrev?: string;
  agencies?: { name: string; type?: string; country_code?: string }[];
  pad_name?: string;
  pad_lat?: number;
  pad_lon?: number;
  location_name?: string;
  location_country?: string;
  location_launch_count?: number;
  location_landing_count?: number;
}

interface RawLaunch {
  id: string;
  name: string;
  last_updated?: string;
  window_start?: string;
  window_end?: string;
  launch_service_provider?: { name?: string; type?: { name?: string } };
  rocket?: {
    configuration?: {
      name?: string;
      families?: { name?: string }[];
      full_name?: string;
    };
  };
  mission?: {
    name?: string;
    description?: string;
    type?: string;
    orbit?: { name?: string; abbrev?: string };
    agencies?: {
      name?: string;
      type?: { name?: string };
      country?: { alpha_2_code?: string }[];
    }[];
  };
  pad?: {
    name?: string;
    latitude?: string;
    longitude?: string;
    location?: {
      name?: string;
      country_code?: string;
      total_launch_count?: number;
      total_landing_count?: number;
    };
  };
}

export function normalizeSpaceLaunch(raw: RawLaunch): SpaceLaunchItem {
  const families = raw.rocket?.configuration?.families ?? [];
  return {
    id: raw.id,
    name: raw.name,
    last_updated: raw.last_updated,
    window_start: raw.window_start,
    window_end: raw.window_end,
    provider: raw.launch_service_provider?.name,
    provider_type: raw.launch_service_provider?.type?.name,
    rocket_name: raw.rocket?.configuration?.name,
    rocket_family: families.map((f) => f.name).filter(Boolean).join(" / "),
    rocket_full_name: raw.rocket?.configuration?.full_name,
    mission_name: raw.mission?.name,
    mission_description: raw.mission?.description,
    mission_type: raw.mission?.type,
    orbit_name: raw.mission?.orbit?.name,
    orbit_abbrev: raw.mission?.orbit?.abbrev,
    agencies: (raw.mission?.agencies ?? []).map((a) => ({
      name: a.name ?? "",
      type: a.type?.name,
      country_code: a.country?.[0]?.alpha_2_code,
    })),
    pad_name: raw.pad?.name,
    pad_lat: raw.pad?.latitude ? parseFloat(raw.pad.latitude) : undefined,
    pad_lon: raw.pad?.longitude ? parseFloat(raw.pad.longitude) : undefined,
    location_name: raw.pad?.location?.name,
    location_country: raw.pad?.location?.country_code,
    location_launch_count: raw.pad?.location?.total_launch_count,
    location_landing_count: raw.pad?.location?.total_landing_count,
  };
}
