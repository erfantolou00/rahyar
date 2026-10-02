"use client";

import { useEffect } from "react";
import { OFFLINE_PRICES_KEY, type OfflinePrice } from "@/lib/pwa/offline-prices";

export function RememberPrices({ rows }: { rows: OfflinePrice[] }) {
  useEffect(() => {
    try {
      const payload = JSON.stringify({ savedAt: new Date().toISOString(), rows });
      localStorage.setItem(OFFLINE_PRICES_KEY, payload);
    } catch {
      // Private mode can reject storage. The offline page then shows an empty list.
    }
  }, [rows]);

  return null;
}
