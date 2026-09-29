import { describe, expect, it, vi } from "vitest";
import { priceAge } from "@/lib/finance/prices/age";
import { fetchWithFallback } from "@/lib/finance/prices/fetch-with-fallback";
import { instrumentForAsset, instrumentForSymbol } from "@/lib/finance/prices/match";
import { describeSource } from "@/lib/finance/prices/source-label";

describe("fetchWithFallback", () => {
  it("uses the second source when the first fails", async () => {
    const result = await fetchWithFallback([
      { name: "primary", run: async () => { throw new Error("down"); } },
      { name: "fallback", run: async () => 10 },
    ]);
    expect(result).toEqual({ price: 10, source: "fallback" });
  });

  it("returns null and does not throw when every source fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await fetchWithFallback([
      { name: "primary", run: async () => { throw new Error("down"); } },
      { name: "fallback", run: async () => { throw new Error("also down"); } },
    ]);
    expect(result).toBeNull();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("priceAge", () => {
  it("marks a quote older than an hour as stale", () => {
    const now = Date.parse("2026-09-27T12:00:00Z");
    const fresh = priceAge("2026-09-27T11:20:00Z", now);
    const stale = priceAge("2026-09-27T10:00:00Z", now);
    expect(fresh.stale).toBe(false);
    expect(fresh.label).toContain("دقیقه پیش");
    expect(stale.stale).toBe(true);
    expect(stale.label).toContain("ساعت پیش");
  });
});

describe("instrumentForSymbol", () => {
  it("recognizes the three live assets", () => {
    expect(instrumentForSymbol("دلار")).toBe("USD");
    expect(instrumentForSymbol("طلای ۱۸ عیار")).toBe("GOLD18");
    expect(instrumentForSymbol("بیت‌کوین")).toBe("BTC");
    expect(instrumentForSymbol("شبندر")).toBeNull();
  });
});

describe("instrumentForAsset", () => {
  it("treats the dollar type as the live USD quote", () => {
    expect(instrumentForAsset("usd", "پس‌انداز")).toBe("USD");
    expect(instrumentForAsset("cash", "دلار")).toBe("USD");
    expect(instrumentForAsset("stock", "فولاد")).toBeNull();
  });
});

describe("describeSource", () => {
  it("abbreviates known feeds and keeps the full name", () => {
    expect(describeSource("tgju-json:price_dollar_rl")).toEqual({
      short: "TGJU",
      full: "نرخ دلار، وب‌سرویس شبکه اطلاع‌رسانی طلا و ارز (TGJU)",
    });
    expect(describeSource("binance:BTCUSDT").short).toBe("بایننس");
    expect(describeSource("دستی")).toEqual({
      short: "دستی",
      full: "قیمت واردشده به‌صورت دستی",
    });
  });
});
