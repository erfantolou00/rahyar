import { describe, expect, it } from "vitest";
import { resolvePriceFeeds } from "@/lib/finance/prices/feeds";

describe("resolvePriceFeeds", () => {
  it("lists the market coins and keeps a stock holding on codal", () => {
    const feeds = resolvePriceFeeds(
      [
        { type: "stock", symbol: "فولاد" },
        { type: "fund", symbol: "عیار" },
        { type: "coin", symbol: "امامی" },
      ],
      [],
    );
    const symbols = feeds.map((feed) => feed.symbol);
    expect(symbols).toEqual(["USD", "GOLD18", "EMAMI", "BAHAR", "NIM", "ROB", "BTC", "عیار", "فولاد"]);
    expect(feeds.find((feed) => feed.symbol === "EMAMI")).toMatchObject({
      label: "سکه امامی",
      priceEnabled: true,
      codalAvailable: false,
      removable: false,
    });
    expect(feeds.find((feed) => feed.symbol === "فولاد")).toMatchObject({
      origin: "holding",
      priceEnabled: true,
      codalEnabled: true,
      removable: false,
    });
    expect(feeds.find((feed) => feed.symbol === "عیار")).toMatchObject({
      codalEnabled: false,
      codalAvailable: true,
    });
    expect(feeds.filter((feed) => feed.symbol === "EMAMI")).toHaveLength(1);
  });

  it("applies a stored switch and shows an added symbol", () => {
    const feeds = resolvePriceFeeds(
      [{ type: "stock", symbol: "فولاد" }],
      [
        { assetType: "coin", symbol: "EMAMI", priceEnabled: false, codalEnabled: true, added: false },
        { assetType: "stock", symbol: "فولاد", priceEnabled: false, codalEnabled: false, added: false },
        { assetType: "stock", symbol: "شپنا", priceEnabled: true, codalEnabled: true, added: true },
        { assetType: "stock", symbol: "حذف‌شده", priceEnabled: true, codalEnabled: false, added: false },
      ],
    );
    expect(feeds.find((feed) => feed.symbol === "EMAMI")).toMatchObject({ priceEnabled: false, codalEnabled: false });
    expect(feeds.find((feed) => feed.symbol === "فولاد")).toMatchObject({
      priceEnabled: false,
      codalEnabled: false,
      removable: false,
    });
    expect(feeds.find((feed) => feed.symbol === "شپنا")).toMatchObject({ origin: "added", removable: true, codalEnabled: true });
    expect(feeds.find((feed) => feed.symbol === "حذف‌شده")).toBeUndefined();
  });
});
