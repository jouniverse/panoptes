"use client";

import { Panel } from "@/components/ui/primitives";
import type { FeedHealth } from "@/core/types";
import type { FredSeries, GscpiPoint, ComtradeLiveItem } from "@/lib/trade-indicators";
import { fixed } from "@/lib/format";
import { Empty } from "./ops-utils";

interface TradePayload {
  fred?: FredSeries[];
  gscpi?: GscpiPoint[];
  gscpiLatest?: number;
  reer?: { label: string; value: number; period: string }[];
  bdry?: { price: number | null; changePct: number | null };
  comtrade?: ComtradeLiveItem[];
  error?: string;
}

export function OpsTradePanel({ payload, health }: { payload?: TradePayload; health: FeedHealth }) {
  if (!payload || payload.error) {
    return (
      <Panel title="TRADE & SUPPLY CHAIN" status={health} className="lg:col-span-1">
        <Empty label={payload?.error ?? "Loading trade indicators…"} />
      </Panel>
    );
  }

  const maxReer = Math.max(...(payload.reer ?? []).map((r) => r.value), 1);

  return (
    <Panel title="TRADE & SUPPLY CHAIN" status={health} className="lg:col-span-1">
      <div className="max-h-72 overflow-y-auto px-3 py-2">
        {(payload.fred ?? []).map((s) => (
          <div key={s.id} className="mb-3 border-b border-[var(--color-grid)] pb-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-[var(--color-on-surface-variant)]">{s.name}</span>
              <span
                className={`code-data text-[11px] ${
                  (s.zScore ?? 0) > 2 ? "text-[var(--color-alert)]" : "text-[var(--color-on-surface)]"
                }`}
              >
                {s.latest != null ? fixed(s.latest, 2) : "—"}
                {s.zScore != null && Math.abs(s.zScore) > 2 ? ` (z=${fixed(s.zScore, 1)})` : ""}
              </span>
            </div>
            <div className="mt-1 flex h-8 items-end gap-px">
              {s.points.slice(-24).map((p) => {
                const vals = s.points.map((x) => x.value);
                const min = Math.min(...vals);
                const max = Math.max(...vals);
                const h = max > min ? ((p.value - min) / (max - min)) * 100 : 50;
                return (
                  <div
                    key={p.date}
                    className="flex-1 bg-[var(--color-intel)] opacity-70"
                    style={{ height: `${Math.max(8, h)}%` }}
                    title={`${p.date}: ${p.value}`}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {payload.gscpiLatest != null && (
          <div className="mb-3 border-b border-[var(--color-grid)] pb-2">
            <div className="flex justify-between font-mono text-[10px]">
              <span className="text-[var(--color-on-surface-variant)]">NY Fed GSCPI (latest)</span>
              <span
                className="code-data"
                style={{
                  color:
                    payload.gscpiLatest < -0.2
                      ? "var(--color-friendly)"
                      : payload.gscpiLatest > 0.2
                        ? "var(--color-alert)"
                        : "var(--color-on-surface)",
                }}
              >
                {fixed(payload.gscpiLatest, 2)}
              </span>
            </div>
            <div className="mt-0.5 text-[9px] text-[var(--color-outline)]">
              Unofficial weak signal — not an official Fed estimate.
            </div>
          </div>
        )}

        {payload.bdry?.price != null && (
          <div className="mb-3 flex justify-between font-mono text-[10px]">
            <span className="text-[var(--color-on-surface-variant)]">BDRY (dry bulk shipping)</span>
            <span className="code-data">
              {fixed(payload.bdry.price, 2)}
              {payload.bdry.changePct != null ? ` (${fixed(payload.bdry.changePct, 2)}%)` : ""}
            </span>
          </div>
        )}

        {(payload.reer ?? []).length > 0 && (
          <div className="mb-3">
            <div className="label-caps mb-1 text-[var(--color-outline)]">BIS REER (latest)</div>
            {(payload.reer ?? []).map((r) => (
              <div key={r.label} className="mb-1 flex items-center gap-2">
                <span className="w-24 shrink-0 font-mono text-[10px] text-[var(--color-on-surface-variant)]">
                  {r.label}
                </span>
                <div className="h-2 flex-1 bg-[var(--color-grid)]">
                  <div
                    className="h-full bg-[var(--color-gold)]"
                    style={{ width: `${(r.value / maxReer) * 100}%` }}
                  />
                </div>
                <span className="code-data w-12 text-right text-[10px]">{fixed(r.value, 1)}</span>
              </div>
            ))}
          </div>
        )}

        {(payload.comtrade ?? []).length > 0 && (
          <div>
            <div className="label-caps mb-1 text-[var(--color-outline)]">UN Comtrade live updates</div>
            <ul className="divide-y divide-[var(--color-grid)]">
              {payload.comtrade!.slice(0, 12).map((c, i) => (
                <li key={i} className="py-1 font-mono text-[9px]">
                  <span className="text-[var(--color-on-surface)]">{c.reporter}</span>
                  <span className="text-[var(--color-outline)]">
                    {" "}
                    · {c.period} · {c.classification} · {c.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!payload.fred?.length && !payload.reer?.length && !payload.comtrade?.length && (
          <Empty label="Configure FRED_API_KEY / UN_COMTRADE_API_KEY for full panel" />
        )}
      </div>
    </Panel>
  );
}
