"use client";

import { useState } from "react";

const TEMPORAL_KEY = /(^|_)(time|date|created|updated|start|end|acq)/i;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T/;

function fmtDate(ms: number): string {
  return (
    new Date(ms).toLocaleString("en-GB", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }) + " UTC"
  );
}

function fmtValue(key: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") {
    if (TEMPORAL_KEY.test(key) && v > 1e11) return fmtDate(v);
    return Number.isInteger(v) ? v.toString() : v.toFixed(4);
  }
  if (typeof v === "string" && ISO_DATETIME.test(v)) {
    const ms = Date.parse(v);
    if (!Number.isNaN(ms)) return fmtDate(ms);
  }
  return String(v);
}

function AttrRow({ name, text }: { name: string; text: string }) {
  const [open, setOpen] = useState(false);
  const label = name.replace(/_/g, " ");
  const isUrl = /^https?:\/\//.test(text);
  const expandable = !isUrl && text.length > 22;
  return (
    <div className="flex justify-between gap-2 px-2 py-1">
      <dt className="label-caps max-w-[40%] shrink-0 truncate" title={label}>
        {label}
      </dt>
      {isUrl ? (
        <a
          href={text}
          target="_blank"
          rel="noreferrer"
          title={text}
          className="code-data min-w-0 flex-1 truncate text-right text-[var(--color-intel)] underline-offset-2 hover:underline"
        >
          {text}
        </a>
      ) : (
        <dd
          title={expandable && !open ? text : undefined}
          onClick={expandable ? () => setOpen((o) => !o) : undefined}
          className={`code-data min-w-0 flex-1 text-right text-[var(--color-on-surface)] ${
            open ? "whitespace-normal break-words" : "truncate"
          } ${expandable ? "hover:text-[var(--color-intel)]" : ""}`}
        >
          {text}
        </dd>
      )}
    </div>
  );
}

interface EntityAttributesProps {
  properties: Record<string, unknown>;
  limit?: number;
}

export function EntityAttributes({ properties, limit = 14 }: EntityAttributesProps) {
  const entries = Object.entries(properties)
    .filter(([, v]) => v != null && v !== "")
    .slice(0, limit);

  if (!entries.length) {
    return <p className="label-caps px-2 py-1 text-[var(--color-outline)]">No attributes</p>;
  }

  return (
    <dl className="divide-y divide-[var(--color-grid)]">
      {entries.map(([k, v]) => (
        <AttrRow key={k} name={k} text={fmtValue(k, v)} />
      ))}
    </dl>
  );
}
