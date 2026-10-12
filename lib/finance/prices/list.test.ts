import { describe, expect, it } from "vitest";
import { parsePriceListQuery, priceListHref, priceSearchFilter } from "@/lib/finance/prices/list";

describe("parsePriceListQuery", () => {
  it("drops filter characters and rejects a bad page", () => {
    expect(parsePriceListQuery(' فولاد,% ', "0")).toEqual({ needle: "فولاد", page: 1 });
  });

  it("keeps a positive page", () => {
    expect(parsePriceListQuery("usd", "3").page).toBe(3);
  });
});

describe("priceSearchFilter", () => {
  it("matches the symbol, the source, and a Persian type label", () => {
    expect(priceSearchFilter("سهام")).toBe('symbol.ilike."%سهام%",source.ilike."%سهام%",asset_type.in.(stock)');
  });

  it("returns null for an empty search", () => {
    expect(priceSearchFilter("")).toBeNull();
  });
});

describe("priceListHref", () => {
  it("omits the page when it is the first page", () => {
    expect(priceListHref("", 1)).toBe("/prices");
    expect(priceListHref("فولاد", 2)).toBe("/prices?q=%D9%81%D9%88%D9%84%D8%A7%D8%AF&page=2");
  });
});
