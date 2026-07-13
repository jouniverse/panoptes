import { create } from "zustand";

export type OpsItemSource =
  | "aviation"
  | "maritime-alert"
  | "satellite"
  | "maritime-ais"
  | "naval-news"
  | "news"
  | "space-launch"
  | "space-weather";

export interface OpsSelectedItem {
  source: OpsItemSource;
  id: string;
  title: string;
  lat?: number;
  lon?: number;
  props: Record<string, unknown>;
}

export interface OpsSelectedLocation {
  lat: number;
  lon: number;
  zoom?: number;
}

interface OpsStore {
  selectedItem: OpsSelectedItem | null;
  location: OpsSelectedLocation | null;
  selectItem: (item: OpsSelectedItem | null) => void;
  clearSelection: () => void;
  setLocation: (loc: OpsSelectedLocation | null) => void;
}

export const useOpsStore = create<OpsStore>((set) => ({
  selectedItem: null,
  location: null,
  selectItem: (item) =>
    set({
      selectedItem: item,
      location:
        item?.lat != null && item?.lon != null
          ? { lat: item.lat, lon: item.lon, zoom: 7 }
          : null,
    }),
  clearSelection: () => set({ selectedItem: null, location: null }),
  setLocation: (loc) => set({ location: loc }),
}));
