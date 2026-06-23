export function compact(n: number | undefined | null, opts: { currency?: boolean } = {}): string {
  if (n == null || Number.isNaN(n)) return "—";
  const fmt = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
    ...(opts.currency ? { style: "currency", currency: "USD" } : {}),
  });
  return fmt.format(n);
}

export function fixed(n: number | undefined | null, d = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(d);
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function downloadFile(name: string, content: string, type = "text/csv") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
