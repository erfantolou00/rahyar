import { describe, expect, it } from "vitest";
import { canSell, moneyIn, positionFromTrades, weekFlowAmounts } from "@/lib/finance/trades";

describe("positionFromTrades", () => {
  it("adds a later buy into the same average and keeps the earlier date", () => {
    expect(
      positionFromTrades([
        { side: "buy", quantity: 1, price: 1000, fee: 0, tradedOn: "2026-09-23" },
        { side: "buy", quantity: 4, price: 2000, fee: 0, tradedOn: "2026-10-18" },
      ]),
    ).toEqual({ quantity: 5, avgBuyPrice: 1800, acquiredOn: "2026-09-23" });
  });

  it("puts the buy fee into the average and leaves a sell fee out of it", () => {
    expect(
      positionFromTrades([
        { side: "buy", quantity: 2, price: 100, fee: 10, tradedOn: "2026-01-01" },
        { side: "sell", quantity: 1, price: 150, fee: 5, tradedOn: "2026-02-01" },
      ]),
    ).toEqual({ quantity: 1, avgBuyPrice: 105, acquiredOn: "2026-01-01" });
  });

  it("refuses a sell larger than the position", () => {
    expect(() =>
      positionFromTrades([
        { side: "buy", quantity: 1, price: 10, fee: 0, tradedOn: "2026-01-01" },
        { side: "sell", quantity: 2, price: 10, fee: 0, tradedOn: "2026-01-02" },
      ]),
    ).toThrow("oversell");
    expect(canSell(1, 2)).toBe(false);
  });
});

describe("week flows", () => {
  it("keeps a buy out of profit and reverses it on the cash row", () => {
    expect(moneyIn({ side: "buy", quantity: 4, price: 2000, fee: 10 })).toBe(8010);
    const flows = weekFlowAmounts(
      [
        {
          assetId: "stock-1",
          cashAssetId: "cash-1",
          side: "buy",
          quantity: 4,
          price: 2000,
          fee: 10,
          unit: "rial",
        },
      ],
      null,
    );
    expect(flows.get("stock-1")).toBe(8010);
    expect(flows.get("cash-1")).toBe(-8010);
  });
});
