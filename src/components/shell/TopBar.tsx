"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/geospatial", label: "GEOSPATIAL" },
  { href: "/analytics", label: "ANALYTICS" },
  { href: "/ops", label: "OPS" },
  { href: "/tools", label: "TOOLS" },
];

export function TopBar() {
  const pathname = usePathname();
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-outline-variant)] bg-[var(--color-surface)] px-3">
      <div className="flex items-center gap-6">
        <Link href="/geospatial" className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rotate-45 border border-[var(--color-intel)] bg-[var(--color-intel)]" />
          <span className="font-mono text-base font-extrabold tracking-[0.18em] text-[var(--color-on-surface)]">
            PANOPTES
          </span>
        </Link>
        <nav aria-label="Sections" className="flex items-center gap-1 overflow-x-auto">
          {SECTIONS.map((s) => {
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
        <div className="hidden items-center gap-2 border-b-2 border-[var(--color-outline-variant)] px-2 py-1 md:flex">
          <span className="text-[var(--color-outline)]">[</span>
          <input
            placeholder="QUERY DATABASE..."
            className="w-44 bg-transparent font-mono text-[11px] tracking-[0.1em] text-[var(--color-on-surface)] placeholder:text-[var(--color-outline)] focus:outline-none"
          />
          <span className="text-[var(--color-outline)]">]</span>
        </div>
        <span className="label-caps text-[var(--color-friendly)]">SECURE</span>
      </div>
    </header>
  );
}
