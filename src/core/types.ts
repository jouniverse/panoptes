// Core domain types shared across layers, rendering, filtering and the timeline.

import type { Geometry } from "geojson";

/**
 * Confidence tier for any geolocated intelligence (pattern from DEEP-STATE).
 * Surfaced in the UI so the map never flattens uncertainty.
 */
export type SourceTier = "confirmed" | "estimated" | "baseline";

/** Per-feed freshness state (pattern from World Monitor / Phantom Tide). */
export type FeedHealth = "live" | "degraded" | "stale" | "offline" | "idle";

/**
 * Normalized entity that every layer transforms its raw data into. Rendering,
 * clustering, filtering, selection and timeline logic all operate generically
 * over this shape — individual layers never get bespoke render code.
 */
export interface GeoEntity {
  /** Stable unique id within the layer. */
  id: string;
  /** Owning layer id (see layer-registry). */
  layerId: string;
  /** Representative point (used for clustering / globe / tooltips). */
  lon: number;
  lat: number;
  /** Optional full geometry for line/polygon layers. */
  geometry?: Geometry;
  /** Short label shown on hover. */
  label: string;
  /** Arbitrary source properties for the detail card. */
  properties: Record<string, unknown>;
  /** Epoch ms; drives the timeline / playback when present. */
  timestamp?: number;
  /** Confidence tier badge. */
  sourceTier?: SourceTier;
  /** Optional severity 0..1 used to scale marker size / intensity. */
  severity?: number;
}

/** Marker glyph families — geometric primitives, never plain dots. */
export type MarkerShape =
  | "diamond" // conflict / political violence
  | "triangle" // military / missile
  | "square" // infrastructure
  | "circle-split" // energy / nuclear
  | "hexagon" // space / satellite
  | "chevron" // aviation (heading-aware)
  | "ring" // area / event radius
  | "cross"; // alerts / hazards

export type LayerKind = "point" | "line" | "polygon" | "heatmap" | "choropleth";

export type RendererSupport = "flat" | "globe" | "both";

/** Thematic groups for the left rail (refined from the integration topics). */
export type LayerCategory =
  | "conflict"
  | "military"
  | "aviation"
  | "maritime"
  | "space"
  | "infrastructure"
  | "mineral-resources"
  | "oil-gas"
  | "plants-factories"
  | "hazards"
  | "humanitarian"
  | "information"
  | "reference";

/** Which intelligence mode a layer belongs to (anti-clutter dual-mode). */
export type IntelMode = "curated" | "osint";

export interface LayerSource {
  /** worker = live data from a client-side Web Worker (not fetched via GeoJSON). */
  kind: "static" | "api" | "pmtiles" | "worker";
  /** For static: path under /geo. For api: route under /api. For pmtiles: url. */
  ref: string;
  /** Free-text provenance shown in the UI + attribution. */
  attribution: string;
  license?: string;
  /** Human cadence label, e.g. "60s", "hourly", "static". */
  cadence: string;
}

export interface LayerDefinition {
  id: string;
  name: string;
  category: LayerCategory;
  mode: IntelMode;
  kind: LayerKind;
  marker: MarkerShape;
  color: string; // hex from PALETTE
  renderer: RendererSupport;
  /** On by default when the app opens. */
  defaultEnabled: boolean;
  source: LayerSource;
  description: string;
  /** Only render at/above this zoom (perf gating for dense layers). */
  minZoom?: number;
  /** Multiplier on base marker size (e.g. overlay layers that must stand out). */
  sizeScale?: number;
  /**
   * Entity positions are NOT a true geolocation (e.g. snapped to a country
   * centroid, then jittered to de-overlap). Suppresses coordinate readouts /
   * imagery deep-links that would be misleading.
   */
  approxLocation?: boolean;
  /** Layer shown in the rail but not yet implemented (cannot be toggled on). */
  placeholder?: boolean;
  /** Lazy import of the layer module (transform + deck layer factory). */
  load?: () => Promise<unknown>;
}
