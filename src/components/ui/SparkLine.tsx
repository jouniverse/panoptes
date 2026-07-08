"use client";

/** Simple SVG sparkline — y-axis min/max on the left, x-axis labels at start/middle/end. */
export function SparkLine({
  points,
  height = 72,
  color = "var(--color-intel)",
  yFormat = (v: number) => String(v),
}: {
  points: { t: number; v: number }[];
  height?: number;
  color?: string;
  yFormat?: (v: number) => string;
}) {
  if (points.length < 2) return null;

  const w = 280;
  const pad = { t: 8, r: 8, b: 22, l: 32 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;

  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const yRange = yMax - yMin || 1;

  const scaleX = (t: number) => pad.l + ((t - xMin) / (xMax - xMin || 1)) * iw;
  const scaleY = (v: number) => pad.t + ih - ((v - yMin) / yRange) * ih;

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p.t).toFixed(1)} ${scaleY(p.v).toFixed(1)}`)
    .join(" ");

  const tickIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const fmtTime = (ms: number) =>
    new Date(ms).toLocaleString("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    });

  const yLabelClass = "fill-[var(--color-outline)] font-mono text-[8px]";

  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" aria-hidden>
      <text
        x={pad.l - 4}
        y={scaleY(yMax)}
        textAnchor="end"
        dominantBaseline="hanging"
        className={yLabelClass}
      >
        {yFormat(yMax)}
      </text>
      {yMin !== yMax && (
        <text
          x={pad.l - 4}
          y={scaleY(yMin)}
          textAnchor="end"
          dominantBaseline="auto"
          className={yLabelClass}
        >
          {yFormat(yMin)}
        </text>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} />
      {tickIdx.map((i) => (
        <text
          key={i}
          x={scaleX(points[i].t)}
          y={height - 4}
          textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
          className={yLabelClass}
        >
          {fmtTime(points[i].t)}
        </text>
      ))}
    </svg>
  );
}
