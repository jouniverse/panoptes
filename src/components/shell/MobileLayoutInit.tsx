"use client";

import { useEffect } from "react";
import { useIsNarrow } from "@/hooks/useMobileLayout";
import { useStore } from "@/core/state/store";

/** Apply mobile-friendly defaults once when the viewport is narrow. */
export function MobileLayoutInit() {
  const narrow = useIsNarrow();

  useEffect(() => {
    if (!narrow) return;
    const s = useStore.getState();
    const patch: Partial<typeof s> = {};
    if (s.leftOpen) patch.leftOpen = false;
    if (s.projection === "globe") patch.projection = "flat";
    if (Object.keys(patch).length) useStore.setState(patch);
  }, [narrow]);

  return null;
}
