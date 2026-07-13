"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayerSearch } from "@/components/shell/LayerSearch";
import { useIsNarrow } from "@/hooks/useMobileLayout";

const SECTIONS = [
  { href: "/geospatial", label: "GEOSPATIAL" },
  { href: "/analytics", label: "ANALYTICS" },
  { href: "/ops", label: "OPS" },
  { href: "/tools", label: "TOOLS" },
];

const MOBILE_SECTIONS = SECTIONS.filter(
  (s) => s.href === "/geospatial" || s.href === "/ops",
);

export function TopBar() {
  const pathname = usePathname();
  const narrow = useIsNarrow();
  const sections = narrow ? MOBILE_SECTIONS : SECTIONS;
  const showLayerSearch = pathname?.startsWith("/geospatial") && !narrow;
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-outline-variant)] bg-[var(--color-surface)] px-3">
      <div className="flex items-center gap-6">
        <Link href="/geospatial" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/panoptes-logo.svg"
            alt=""
            width={22}
            height={22}
            className="h-[22px] w-[22px] shrink-0"
          />
          <span className="font-mono text-base font-extrabold tracking-[0.18em] text-[var(--color-on-surface)]">
            PANOPTES
          </span>
        </Link>
        <nav aria-label="Sections" className="flex items-center gap-1 overflow-x-auto">
          {sections.map((s) => {
            const active = pathname?.startsWith(s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`relative px-3 py-1 font-mono text-[11px] font-bold tracking-[0.14em] transition-colors ${
                  active
                    ? "text-[var(--color-intel)]"
                    : "text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]"
                }`}
              >
                {s.label}
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 bg-[var(--color-intel)]" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        {showLayerSearch && <LayerSearch />}
        <span className="label-caps text-[var(--color-friendly)]">SECURE</span>
      </div>
    </header>
  );
}
