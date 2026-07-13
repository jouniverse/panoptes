"use client";

import { useIsNarrow } from "@/hooks/useMobileLayout";

export function MobileBanner() {
  const narrow = useIsNarrow();
  if (!narrow) return null;

  return (
    <div
      role="status"
      className="shrink-0 border-b border-[var(--color-outline-variant)] bg-[var(--color-surface-1)] px-3 py-1.5 text-center font-mono text-[10px] tracking-[0.08em] text-[var(--color-outline)]"
    >
      MOBILE / TABLET VIEW — GEOSPATIAL & OPS ONLY // DESKTOP RECOMMENDED FOR FULL ACCESS
    </div>
  );
}
