"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const MIN_GAP_MS = 60_000;

let syncedAt = 0;
let request: Promise<{ refreshed?: boolean } | null> | null = null;

export function BackgroundPriceSync() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const now = Date.now();
    if (request) {
      void request.then((body) => {
        if (body?.refreshed) router.refresh();
      });
      return;
    }
    if (now - syncedAt < MIN_GAP_MS) return;

    syncedAt = now;
    const pending = fetch("/api/prices/sync", { method: "POST" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { refreshed?: boolean };
      })
      .catch(() => null);
    request = pending;
    void pending.finally(() => {
      if (request === pending) request = null;
    });
    void pending.then((body) => {
      if (body?.refreshed) router.refresh();
    });
  }, [pathname, router]);

  return null;
}
