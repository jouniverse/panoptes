"use client";

import { useQuery } from "@tanstack/react-query";

export function FlightIntel({ hex, properties }: { hex: string; properties: Record<string, unknown> }) {
  const photoQ = useQuery({
    queryKey: ["aircraft-photo", hex],
    queryFn: async () => {
      const res = await fetch(`/api/aircraft-photo?hex=${encodeURIComponent(hex)}`);
      if (!res.ok) return { url: undefined };
      return res.json() as Promise<{ url?: string; link?: string; photographer?: string }>;
    },
    staleTime: 24 * 60 * 60_000,
    enabled: /^[0-9a-f]{6}$/i.test(hex),
  });

  const enrichKeys = [
    "operator",
    "owner",
    "operator_country",
    "origin_country",
    "registration",
    "type",
    "description",
    "squawk",
    "match_status",
    "military_reason",
    "altitude",
    "speed_kt",
    "heading",
    "source",
    "on_ground",
  ] as const;

  const rows = enrichKeys
    .map((k) => [k, properties[k]] as const)
    .filter(([, v]) => v != null && v !== "");

  return (
    <div className="mt-3 space-y-3">
      {photoQ.data?.url && (
        <div className="border border-[var(--color-outline-variant)]">
          <div className="label-caps border-b border-[var(--color-outline-variant)] px-2 py-1">
            AIRCRAFT // {hex.toUpperCase()}
          </div>
          <a
            href={photoQ.data.link ?? photoQ.data.url}
            target="_blank"
            rel="noreferrer"
            className="block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoQ.data.url}
              alt={`Aircraft ${hex}`}
              className="max-h-40 w-full object-cover"
            />
          </a>
          {photoQ.data.photographer && (
            <div className="label-caps px-2 py-1 text-[var(--color-outline)]">
              PHOTO: {photoQ.data.photographer} (Planespotters)
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="border border-[var(--color-outline-variant)]">
          <div className="label-caps border-b border-[var(--color-outline-variant)] px-2 py-1">
            FLIGHT INTEL
          </div>
          <dl className="divide-y divide-[var(--color-grid)]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 px-2 py-1">
                <dt className="label-caps text-[var(--color-outline)]">{k.replace(/_/g, " ")}</dt>
                <dd className="code-data text-[var(--color-on-surface)]">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
