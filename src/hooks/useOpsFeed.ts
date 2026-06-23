"use client";

import { useQuery } from "@tanstack/react-query";
import type { FeedHealth } from "@/core/types";

export interface OpsFeed<T> {
  items: T[];
  health: FeedHealth;
  isLoading: boolean;
  updatedAt: number;
}

/** Generic poller for an Ops JSON feed; reads the X-Panoptes-Health header. */
export function useOpsFeed<T>(
  name: string,
  url: string,
  pick: (json: unknown) => T[],
  intervalMs: number,
): OpsFeed<T> {
  const q = useQuery({
    queryKey: ["ops", name],
    queryFn: async () => {
      const res = await fetch(url);
      const health = (res.headers.get("X-Panoptes-Health") as FeedHealth) ?? "live";
      const json = await res.json();
      return { items: pick(json), health };
    },
    refetchInterval: intervalMs,
    staleTime: intervalMs,
  });

  return {
    items: q.data?.items ?? [],
    health: q.isLoading ? "idle" : q.isError ? "stale" : (q.data?.health ?? "live"),
    isLoading: q.isLoading,
    updatedAt: q.dataUpdatedAt,
  };
}
