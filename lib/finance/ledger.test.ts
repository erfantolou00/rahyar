import { describe, expect, it } from "vitest";
import { accountKindFor, applyPositionDelta, defaultAccountName, isCashAsset, isLedgerAsset } from "@/lib/finance/ledger";

describe("ledger accounts", () => {
  it("keeps each domain in its own venue and currency", () => {
    expect(accountKindFor("stock", "rial")).toBe("brokerage");
    expect(accountKindFor("fund", "rial")).toBe("brokerage");
    expect(accountKindFor("gold", "rial")).toBe("bullion");
    expect(accountKindFor("coin", "rial")).toBe("bullion");
    expect(accountKindFor("usd", "usd")).toBe("fx");
    expect(accountKindFor("cash", "usd")).toBe("fx");
    expect(accountKindFor("cash", "rial")).toBe("brokerage");
    expect(accountKindFor("crypto", "usd")).toBe("wallet");
    expect(defaultAccountName("bullion", "rial")).toBe("طلا و سکه");
    expect(isLedgerAsset("real_estate")).toBe(false);
    expect(isCashAsset("usd")).toBe(true);
  });
});

describe("applyPositionDelta", () => {
  it("adds a buy fee to the average and leaves the sell average unchanged", () => {
    const bought = applyPositionDelta(
      { quantity: 0, avgBuyPrice: null },
      { side: "buy", quantity: 2, price: 100, fee: 10 },
    );
    expect(bought).toEqual({ quantity: 2, avgBuyPrice: 105 });
    expect(
      applyPositionDelta(bought, { side: "sell", quantity: 1, price: 150, fee: 5 }),
    ).toEqual({ quantity: 1, avgBuyPrice: 105 });
  });

  it("moves quantity at the source average", () => {
    const source = applyPositionDelta(
      { quantity: 4, avgBuyPrice: 50 },
      { side: "sell", quantity: 1, price: null, fee: 0 },
    );
    const destination = applyPositionDelta(
      { quantity: 1, avgBuyPrice: 80 },
      { side: "buy", quantity: 1, price: 50, fee: 0 },
    );
    expect(source).toEqual({ quantity: 3, avgBuyPrice: 50 });
    expect(destination).toEqual({ quantity: 2, avgBuyPrice: 65 });
  });

  it("keeps an unknown cost unknown when another lot is added", () => {
    expect(
      applyPositionDelta({ quantity: 2, avgBuyPrice: null }, { side: "buy", quantity: 1, price: 10, fee: 0 }),
    ).toEqual({ quantity: 3, avgBuyPrice: null });
  });

  it("refuses a sell larger than the account position", () => {
    expect(() =>
      applyPositionDelta({ quantity: 1, avgBuyPrice: 10 }, { side: "sell", quantity: 2, price: 10, fee: 0 }),
    ).toThrow("oversell");
  });
});
