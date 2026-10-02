import { describe, expect, it } from "vitest";
import { latestOfflinePrices } from "@/lib/pwa/offline-prices";

describe("latestOfflinePrices", () => {
  it("keeps the newest row of each symbol and shows bitcoin in dollars", () => {
    const rows = latestOfflinePrices([
      { asset_type: "usd", symbol: "USD", price: 600_000, timestamp: "2026-10-02T10:00:00Z" },
      { asset_type: "usd", symbol: "USD", price: 1, timestamp: "2026-10-01T10:00:00Z" },
      { asset_type: "crypto", symbol: "BTC", price: 60_000, timestamp: "2026-10-02T10:00:00Z" },
    ]);

    expect(rows.map((row) => row.symbol)).toEqual(["USD", "BTC"]);
    expect(rows[0]?.typeLabel).toBe("دلار");
    expect(rows[0]?.priceLabel).not.toContain("دلار");
    expect(rows[1]?.priceLabel).toContain("دلار");
  });

  it("falls back to the raw rial quote when bitcoin cannot be converted", () => {
    const rows = latestOfflinePrices([
      { asset_type: "crypto", symbol: "BTC", price: 20_000_000, timestamp: "2026-10-02T10:00:00Z" },
    ]);

    expect(rows[0]?.priceLabel).not.toContain("دلار");
  });
});
