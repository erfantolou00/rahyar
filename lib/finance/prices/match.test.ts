import { describe, expect, it } from "vitest";
import { quoteSeriesKey } from "@/lib/finance/prices/match";

describe("quoteSeriesKey", () => {
  it("maps a gold display name to the stored market symbol", () => {
    expect(quoteSeriesKey("gold", "طلا")).toEqual({ assetType: "gold", symbol: "GOLD18" });
  });

  it("maps a dollar holding to USD even when the name is custom", () => {
    expect(quoteSeriesKey("usd", "پس‌انداز")).toEqual({ assetType: "usd", symbol: "USD" });
  });

  it("keeps a listed symbol as stored", () => {
    expect(quoteSeriesKey("stock", "فولاد")).toEqual({ assetType: "stock", symbol: "فولاد" });
  });

  it("maps coin names onto the four market coins", () => {
    expect(quoteSeriesKey("coin", "امامی")).toEqual({ assetType: "coin", symbol: "EMAMI" });
    expect(quoteSeriesKey("coin", "بهار آزادی")).toEqual({ assetType: "coin", symbol: "BAHAR" });
    expect(quoteSeriesKey("coin", "نیم سکه")).toEqual({ assetType: "coin", symbol: "NIM" });
    expect(quoteSeriesKey("gold", "ربع سکه")).toEqual({ assetType: "coin", symbol: "ROB" });
    expect(quoteSeriesKey("coin", "هدیه")).toEqual({ assetType: "coin", symbol: "هدیه" });
  });
});
