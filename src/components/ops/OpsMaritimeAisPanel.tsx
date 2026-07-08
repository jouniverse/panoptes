"use client";

import { Panel } from "@/components/ui/primitives";
import { Empty } from "./ops-utils";

export function OpsMaritimeAisPanel() {
  return (
    <Panel title="MARITIME // AIS" status="idle" className="lg:col-span-1">
      <Empty label="Live AIS feed — WebSocket relay required (deferred)" />
      <div className="border-t border-[var(--color-outline-variant)] px-3 py-2">
        <div className="label-caps text-[var(--color-outline)]">
          AISStream requires a sidecar WebSocket→SSE relay (Phase 3). Panel reserved.
        </div>
      </div>
    </Panel>
  );
}
