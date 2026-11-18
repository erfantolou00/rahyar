"use client";

import { useEffect } from "react";
import { syncAppBadge } from "@/lib/pwa/badge";
import { OFFLINE_PRICES_KEY, type OfflinePrice } from "@/lib/pwa/offline-prices";

type ShellPayload = {
  badge: number;
  prices: OfflinePrice[];
};

export function DashboardShellSync() {
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/shell", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as ShellPayload;
      })
      .then((body) => {
        if (!body || !Number.isFinite(body.badge)) return;
        void syncAppBadge(body.badge);
        try {
          const payload = JSON.stringify({ savedAt: new Date().toISOString(), rows: body.prices ?? [] });
          localStorage.setItem(OFFLINE_PRICES_KEY, payload);
        } catch {
          // Private mode can reject storage. The offline page then shows an empty list.
        }
      })
      .catch(() => {
        // A failed hint must not block the page. The next full load tries again.
      });
    return () => controller.abort();
  }, []);

  return null;
}
