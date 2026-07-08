import type { Feature, Point } from "geojson";

export function featureCoords(f: Feature): { lat: number; lon: number } | null {
  if (f.geometry?.type !== "Point") return null;
  const [lon, lat] = (f.geometry as Point).coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

export function pickFeatures(j: unknown): Feature[] {
  return (j as { features?: Feature[] }).features ?? [];
}

export function Empty({ label }: { label: string }) {
  return (
    <div className="label-caps px-3 py-6 text-center text-[var(--color-outline)]">{label}</div>
  );
}

export function FeedList({
  rows,
  empty,
  onSelect,
  selectedId,
}: {
  rows: { id: string; primary: string; secondary: string }[];
  empty: string;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  if (!rows.length) return <Empty label={empty} />;
  return (
    <ul className="max-h-72 divide-y divide-[var(--color-grid)] overflow-y-auto">
      {rows.map((r) => (
        <li
          key={r.id}
          className={`flex cursor-pointer items-center justify-between px-3 py-1 hover:bg-[rgba(0,209,255,0.05)] ${
            selectedId === r.id ? "bg-[rgba(255,199,0,0.08)]" : ""
          }`}
          onClick={() => onSelect?.(r.id)}
        >
          <span className="truncate font-mono text-[11px] text-[var(--color-on-surface)]">
            {r.primary}
          </span>
          <span className="code-data ml-2 shrink-0 text-[var(--color-outline)]">{r.secondary}</span>
        </li>
      ))}
    </ul>
  );
}
