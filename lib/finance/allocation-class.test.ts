import { describe, expect, it } from "vitest";
import {
  effectiveAllocationClass,
  suggestAllocationClass,
} from "@/lib/finance/allocation-class";
import { buildPortfolio } from "@/lib/finance/portfolio";
import type { Asset } from "@/lib/finance/types";

describe("suggestAllocationClass", () => {
  it("treats coins, physical gold, and the Ayar fund as gold", () => {
    expect(suggestAllocationClass("coin", "امامی")).toBe("gold");
    expect(suggestAllocationClass("coin", "نیم سکه")).toBe("gold");
    expect(suggestAllocationClass("coin", "ربع سکه")).toBe("gold");
    expect(suggestAllocationClass("gold", "طلای ۱۸ عیار")).toBe("gold");
    expect(suggestAllocationClass("fund", "عیار")).toBe("gold");
    expect(suggestAllocationClass("fund", "کهربا")).toBe("gold");
  });

  it("leaves ordinary stocks and funds in their own class", () => {
    expect(suggestAllocationClass("stock", "فولاد")).toBe("stock");
    expect(suggestAllocationClass("stock", "فزر")).toBe("stock");
    expect(suggestAllocationClass("fund", "دارونو")).toBe("fund");
    expect(suggestAllocationClass("fund", "موج")).toBe("fund");
    expect(suggestAllocationClass("fund", "نقرابی")).toBe("fund");
    expect(suggestAllocationClass("crypto", "بیتکوین")).toBe("crypto");
    expect(suggestAllocationClass("usd", "دلار")).toBe("usd");
  });
});

describe("effectiveAllocationClass", () => {
  it("keeps a manual class when the name would suggest gold", () => {
    expect(
      effectiveAllocationClass({
        type: "fund",
        symbol: "عیار",
        allocation_class: "fund",
        allocation_class_source: "manual",
      }),
    ).toBe("fund");
  });

  it("recomputes an automatic class from the name", () => {
    expect(
      effectiveAllocationClass({
        type: "fund",
        symbol: "عیار",
        allocation_class: "fund",
        allocation_class_source: "auto",
      }),
    ).toBe("gold");
  });
});

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "1",
    user_id: "user",
    type: "fund",
    symbol: "عیار",
    quantity: 1,
    avg_buy_price: null,
    target_min_weight: null,
    target_max_weight: null,
    risk_level: null,
    manual_value: 60,
    price_unit: "rial",
    allocation_class: "fund",
    allocation_class_source: "auto",
    created_at: "2026-09-29T00:00:00.000Z",
    updated_at: "2026-09-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildPortfolio allocation classes", () => {
  it("adds a coin and a gold fund into one gold weight", () => {
    const snapshot = buildPortfolio(
      [
        asset({ id: "coin", type: "coin", symbol: "امامی", manual_value: 40 }),
        asset({ id: "fund", type: "fund", symbol: "عیار", manual_value: 60 }),
      ],
      [],
      [],
    );

    expect(snapshot.byType).toEqual([
      expect.objectContaining({ type: "gold", value: 100, weight: 100 }),
    ]);
  });
});
