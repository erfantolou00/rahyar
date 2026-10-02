"use client";

import { useEffect } from "react";
import { syncAppBadge } from "@/lib/pwa/badge";

export function AppBadge({ count }: { count: number | null }) {
  useEffect(() => {
    if (count == null) return;
    void syncAppBadge(count);
  }, [count]);

  return null;
}
