"use client";

import type { FeedHealth } from "@/core/types";

const HEALTH_COLOR: Record<FeedHealth, string> = {
  live: "var(--color-friendly)",
  degraded: "var(--color-gold)",
  stale: "var(--color-alert)",
  offline: "var(--color-outline-variant)",
  idle: "var(--color-outline)",
};

export function StatusLight({
  state,
  pulse = false,
}: {
  state: FeedHealth;
  pulse?: boolean;
}) {
  return (
    <span
      className={`status-dot ${pulse && (state === "live" || state === "idle") ? "pan-pulse" : ""}`}
      style={{ background: HEALTH_COLOR[state], boxShadow: `0 0 6px ${HEALTH_COLOR[state]}` }}
      title={state}
    />
  );
}

export function Panel({
  title,
  status,
  right,
  children,
  className = "",
}: {
  title?: string;
  status?: FeedHealth;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`pan-glass pan-scanlines ${className}`}>
      {title && (
        <header className="flex h-6 items-center justify-between border-b border-[var(--color-outline-variant)] px-2">
          <div className="flex items-center gap-1.5">
            {status && <StatusLight state={status} pulse />}
            <span className="label-caps">{title}</span>
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function TacticalButton({
  children,
  active = false,
  onClick,
  title,
  className = "",
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`pan-notch border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors ${
        active
          ? "border-[var(--color-intel)] bg-[var(--color-intel)] text-[var(--color-obsidian)]"
          : "border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)] hover:bg-[rgba(0,209,255,0.1)] hover:text-[var(--color-intel)]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Stat({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--color-outline-variant)] bg-[rgba(12,14,18,0.6)] p-2">
      <div className="label-caps">{label}</div>
      <div
        className="mt-1 font-mono text-lg font-bold"
        style={{ color: accent ?? "var(--color-on-surface)" }}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-[var(--color-on-surface-variant)]">{sub}</div>}
    </div>
  );
}
