import { create } from "zustand";
import { defaultLayerState } from "@/config/layer-registry";
import type { FeedHealth, GeoEntity, IntelMode } from "@/core/types";

export type Projection = "flat" | "globe";
export type IntelFilter = IntelMode | "all";

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

interface LayersSlice {
  enabled: Record<string, boolean>;
  health: Record<string, FeedHealth>;
  counts: Record<string, number>;
  intelFilter: IntelFilter;
  toggleLayer: (id: string) => void;
  setLayer: (id: string, on: boolean) => void;
  setHealth: (id: string, h: FeedHealth) => void;
  setCount: (id: string, n: number) => void;
  setIntelFilter: (f: IntelFilter) => void;
}

interface ViewSlice {
  projection: Projection;
  viewState: ViewState;
  leftOpen: boolean;
  rightOpen: boolean;
  setProjection: (p: Projection) => void;
  setViewState: (v: ViewState) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  setRightOpen: (open: boolean) => void;
}

interface SelectionSlice {
  selected: GeoEntity | null;
  hovered: GeoEntity | null;
  hoverScreen: { x: number; y: number } | null;
  select: (e: GeoEntity | null) => void;
  hover: (e: GeoEntity | null, screen?: { x: number; y: number } | null) => void;
}

export interface TimelineState {
  enabled: boolean;
  playing: boolean;
  current: number; // epoch ms (upper bound of visible window)
  windowMs: number;
  min: number;
  max: number;
}

interface TimelineSlice {
  timeline: TimelineState;
  toggleTimeline: () => void;
  setPlaying: (p: boolean) => void;
  setCurrent: (t: number) => void;
  setWindow: (ms: number) => void;
}

export type AppStore = LayersSlice & ViewSlice & SelectionSlice & TimelineSlice;

export const DEFAULT_VIEW: ViewState = {
  longitude: 17.86,
  latitude: 34.06,
  zoom: 1.6,
  pitch: 0,
  bearing: 0,
};

export const useStore = create<AppStore>((set) => ({
  // ---- layers
  enabled: defaultLayerState(),
  health: {},
  counts: {},
  intelFilter: "all",
  toggleLayer: (id) =>
    set((s) => ({ enabled: { ...s.enabled, [id]: !s.enabled[id] } })),
  setLayer: (id, on) => set((s) => ({ enabled: { ...s.enabled, [id]: on } })),
  setHealth: (id, h) => set((s) => ({ health: { ...s.health, [id]: h } })),
  setCount: (id, n) => set((s) => ({ counts: { ...s.counts, [id]: n } })),
  setIntelFilter: (f) => set({ intelFilter: f }),

  // ---- view
  projection: "flat",
  viewState: DEFAULT_VIEW,
  leftOpen: true,
  rightOpen: false,
  setProjection: (p) => set({ projection: p }),
  setViewState: (v) => set({ viewState: v }),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  setRightOpen: (open) => set({ rightOpen: open }),

  // ---- selection
  selected: null,
  hovered: null,
  hoverScreen: null,
  select: (e) => set({ selected: e, rightOpen: e ? true : false }),
  hover: (e, screen = null) => set({ hovered: e, hoverScreen: screen ?? null }),

  // ---- timeline
  timeline: {
    enabled: false,
    playing: false,
    current: Date.now(),
    windowMs: 24 * 60 * 60_000,
    min: Date.now() - 7 * 24 * 60 * 60_000,
    max: Date.now(),
  },
  toggleTimeline: () =>
    set((s) => ({
      timeline: { ...s.timeline, enabled: !s.timeline.enabled, playing: false, current: s.timeline.max },
    })),
  setPlaying: (p) => set((s) => ({ timeline: { ...s.timeline, playing: p } })),
  setCurrent: (t) => set((s) => ({ timeline: { ...s.timeline, current: t } })),
  setWindow: (ms) => set((s) => ({ timeline: { ...s.timeline, windowMs: ms } })),
}));
