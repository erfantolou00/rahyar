import { describe, expect, it, vi } from "vitest";
import { priceAge } from "@/lib/finance/prices/age";
import { fetchWithFallback } from "@/lib/finance/prices/fetch-with-fallback";
import { instrumentForAsset, instrumentForSymbol } from "@/lib/finance/prices/match";
import { describeSource } from "@/lib/finance/prices/source-label";
import {
  MarketShapeError,
  matchListedSymbol,
  parseClosingPrice,
  parseInstrumentEps,
  parseLegacyLastPrice,
  parseLegacySearch,
  parseTsetmcSearch,
} from "@/lib/finance/prices/listed";

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
    expect(describeSource("nobitex:usdt-rls").short).toBe("نوبیتکس");
    expect(describeSource("nobitex:btc-usdt").full).toContain("بیت‌کوین");
    expect(describeSource("gold-api:XAU*nobitex:usdt-rls").short).toBe("انس جهانی");
    expect(describeSource("دستی")).toEqual({
      short: "دستی",
      full: "قیمت واردشده به‌صورت دستی",
    });
    expect(describeSource("tsetmc-cdn:last").short).toBe("بورس");
    expect(describeSource("rahavard:last").short).toBe("رهاورد");
  });
});

describe("listed market parsers", () => {
  it("matches the ticker exactly and reads the last trade", () => {
    const rows = parseTsetmcSearch({
      instrumentSearch: [
        { lVal18AFC: "فولاد", insCode: "46348559193224090" },
        { lVal18AFC: "توسكا", insCode: "56871139881800017" },
      ],
    });
    expect(matchListedSymbol(rows, "فولاد")?.insCode).toBe("46348559193224090");
    expect(matchListedSymbol(rows, "مبارکه")).toBeNull();
    expect(parseClosingPrice({ closingPriceInfo: { pDrCotVal: 3710, pClosing: 3700 } })).toBe(3710);
    expect(parseInstrumentEps({ instrumentInfo: { eps: { estimatedEPS: "518", epsValue: null } } })).toBe(518);
  });

  it("reads the legacy text feed and rejects a changed payload", () => {
    expect(parseLegacySearch("فولاد,فولاد مبارکه,46348559193224090,1;عیار,صندوق عیار,99999,1")).toEqual([
      { symbol: "فولاد", insCode: "46348559193224090" },
      { symbol: "عیار", insCode: "99999" },
    ]);
    expect(parseLegacyLastPrice("12:30:00,A ,3710,3700,3720,3620")).toBe(3710);
    expect(() => parseClosingPrice({ price: 10 })).toThrow(MarketShapeError);
    expect(() => parseLegacySearch("<html>moved</html>")).toThrow(MarketShapeError);
  });
});
