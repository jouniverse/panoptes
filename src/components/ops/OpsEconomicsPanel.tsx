"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/primitives";
import type { FeedHealth } from "@/core/types";
import type { MarketQuote } from "@/lib/yahoo-markets";
import type { EiaSeries } from "@/lib/eia";
import { fixed } from "@/lib/format";
import { Empty } from "./ops-utils";

interface MarketsPayload {
  quotes?: MarketQuote[];
  error?: string;
}

interface EiaPayload {
  series?: EiaSeries[];
  fred?: { id: string; name: string; unit: string; latest?: { period: string; value: number } } | null;
  error?: string;
}

export function OpsEconomicsPanel({
  eia,
  eiaHealth,
}: {
  eia?: EiaPayload;
  eiaHealth: FeedHealth;
}) {
  const [extended, setExtended] = useState(false);
  const marketsQ = useQuery({
    queryKey: ["ops-markets", extended],
    queryFn: async () => {
      const r = await fetch(`/api/ops/markets?extended=${extended ? "1" : "0"}`);
      return r.json() as Promise<MarketsPayload>;
    },
    refetchInterval: 5 * 60_000,
    staleTime: 5 * 60_000,
  });
  const quotes = marketsQ.data?.quotes ?? [];
  const marketsHealth = marketsQ.isLoading ? "idle" : marketsQ.isError ? "stale" : "live";
  const health = marketsHealth === "live" || eiaHealth === "live" ? "live" : "degraded";

  return (
    <Panel title="ECONOMICS & FINANCE" status={health} className="lg:col-span-1">
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="label-caps text-[var(--color-outline)]">
              <th className="px-2 py-1 text-left font-normal">Symbol</th>
              <th className="px-2 py-1 text-left font-normal">Name</th>
              <th className="px-2 py-1 text-right font-normal">Value</th>
              <th className="px-2 py-1 text-right font-normal">Δ%</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.symbol} className="border-t border-[var(--color-grid)]">
                <td className="code-data px-2 py-0.5 text-[var(--color-intel)]">{q.symbol}</td>
                <td className="px-2 py-0.5 text-[var(--color-on-surface-variant)]">{q.name}</td>
                <td className="code-data px-2 py-0.5 text-right">
                  {q.price != null ? fixed(q.price, q.price < 10 ? 4 : 2) : "—"}
                </td>
                <td
                  className={`code-data px-2 py-0.5 text-right ${
                    (q.changePct ?? 0) >= 0 ? "text-[var(--color-friendly)]" : "text-[var(--color-alert)]"
                  }`}
                >
                  {q.changePct != null ? `${fixed(q.changePct, 2)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!quotes.length && <Empty label={marketsQ.data?.error ?? "Loading markets…"} />}
        <button
          type="button"
          className="label-caps w-full border-t border-[var(--color-grid)] px-3 py-1.5 text-[var(--color-outline)] hover:text-[var(--color-intel)]"
          onClick={() => setExtended((v) => !v)}
        >
          {extended ? "Show core tickers" : "Show extended tickers"}
        </button>
        <div className="border-t border-[var(--color-grid)] px-3 py-2">
          <div className="label-caps mb-1 text-[var(--color-gold)]">Oil & Energy // EIA+FRED</div>
          {(eia?.series ?? []).map((s) => (
            <div key={s.id} className="mb-1 flex justify-between gap-2 font-mono text-[10px]">
              <span className="text-[var(--color-on-surface-variant)]">{s.name}</span>
              <span className="code-data text-[var(--color-on-surface)]">
                {s.latest ? `${fixed(s.latest.value, 1)} ${s.unit} (${s.latest.period})` : "—"}
              </span>
            </div>
          ))}
          {eia?.fred?.latest && (
            <div className="mb-1 flex justify-between gap-2 font-mono text-[10px]">
              <span className="text-[var(--color-on-surface-variant)]">{eia.fred.name}</span>
              <span className="code-data text-[var(--color-on-surface)]">
                {`${fixed(eia.fred.latest.value, 2)} ${eia.fred.unit} (${eia.fred.latest.period})`}
              </span>
            </div>
          )}
          {!eia?.series?.length && !eia?.fred?.latest && (
            <div className="text-[10px] text-[var(--color-outline)]">{eia?.error ?? "EIA unavailable"}</div>
          )}
        </div>
      </div>
    </Panel>
  );
}
