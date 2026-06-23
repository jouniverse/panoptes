import type { MarkerShape } from "@/core/types";

const CELL = 64;
const PAD = 10;
const SHAPES: MarkerShape[] = [
  "diamond",
  "triangle",
  "square",
  "circle-split",
  "hexagon",
  "chevron",
  "ring",
  "cross",
];

export interface IconMappingEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  mask: boolean;
}

export type IconMapping = Record<string, IconMappingEntry>;

let cached: { atlas: HTMLCanvasElement; mapping: IconMapping } | null = null;

/**
 * Build a white-on-transparent glyph atlas for tactical markers. IconLayer
 * tints each glyph via getColor, so one atlas serves every layer/color.
 * Glyphs are geometric primitives — never plain dots (per design system).
 */
export function getMarkerAtlas(): { atlas: HTMLCanvasElement; mapping: IconMapping } {
  if (cached) return cached;
  const atlas = document.createElement("canvas");
  atlas.width = CELL * SHAPES.length;
  atlas.height = CELL;
  const ctx = atlas.getContext("2d")!;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const mapping: IconMapping = {};
  SHAPES.forEach((shape, i) => {
    const ox = i * CELL;
    const cx = ox + CELL / 2;
    const cy = CELL / 2;
    const r = CELL / 2 - PAD;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    drawShape(ctx, shape, cx, cy, r);
    ctx.restore();
    mapping[shape] = {
      x: ox,
      y: 0,
      width: CELL,
      height: CELL,
      anchorX: CELL / 2,
      anchorY: CELL / 2,
      mask: true,
    };
  });

  cached = { atlas, mapping };
  return cached;
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: MarkerShape,
  cx: number,
  cy: number,
  r: number,
) {
  switch (shape) {
    case "diamond":
      poly(ctx, [
        [cx, cy - r],
        [cx + r, cy],
        [cx, cy + r],
        [cx - r, cy],
      ]);
      ctx.fill();
      break;
    case "triangle":
      poly(ctx, [
        [cx, cy - r],
        [cx + r, cy + r],
        [cx - r, cy + r],
      ]);
      ctx.fill();
      break;
    case "square":
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      break;
    case "circle-split":
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // notch the split out (transparent) to read as a divided circle
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      break;
    case "hexagon": {
      const pts: [number, number][] = [];
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k - Math.PI / 2;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
      poly(ctx, pts);
      ctx.fill();
      break;
    }
    case "chevron":
      poly(ctx, [
        [cx, cy - r],
        [cx + r * 0.8, cy + r],
        [cx, cy + r * 0.4],
        [cx - r * 0.8, cy + r],
      ]);
      ctx.fill();
      break;
    case "ring":
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "cross":
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
      break;
  }
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}
