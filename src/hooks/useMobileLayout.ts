"use client";

import { useSyncExternalStore } from "react";

/**
 * Touch-first layout query — phones, portrait tablets, landscape iPads.
 * Mirrors CSS: (max-width: 1024px), (pointer: coarse) and (max-width: 1366px)
 */
export const MOBILE_LAYOUT_QUERY =
  "(max-width: 1024px), (pointer: coarse) and (max-width: 1366px)";

/** Desktop layout — fine-pointer laptops/desktops and very wide screens. */
export const DESKTOP_LAYOUT_QUERY =
  "(min-width: 1025px) and (pointer: fine), (min-width: 1367px)";

export function isMobileLayout(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia(MOBILE_LAYOUT_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getSnapshot() {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

/** True when the touch-first (mobile / iPad) shell should be used. */
export function useIsNarrow() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
