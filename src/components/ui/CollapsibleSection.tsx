"use client";

import { useState, type ReactNode } from "react";

export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="mt-4 border border-[var(--color-outline-variant)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="label-caps flex w-full items-center justify-between px-3 py-1.5 text-left text-[var(--color-on-surface-variant)] hover:bg-[rgba(0,209,255,0.04)]"
      >
        <span>{title}</span>
        <span className="text-[var(--color-outline)]">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="border-t border-[var(--color-outline-variant)] p-3">{children}</div>}
    </section>
  );
}
