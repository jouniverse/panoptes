"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsNarrow } from "@/hooks/useMobileLayout";

const BLOCKED_PREFIXES = ["/analytics", "/tools"];

export function NarrowViewGuard({ children }: { children: React.ReactNode }) {
  const narrow = useIsNarrow();
  const pathname = usePathname();
  const router = useRouter();

  const blocked = BLOCKED_PREFIXES.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (narrow && blocked) router.replace("/geospatial");
  }, [narrow, blocked, router]);

  if (narrow && blocked) return null;

  return children;
}
