import { describe, expect, it } from "vitest";
import {
  activeAllocations,
  allocationDeviations,
  currentTypeWeights,
  deviationMessage,
  suggestedRebalancePercent,
} from "@/lib/finance/allocation-deviation";
import type { Allocation, Asset, PortfolioSnapshot, Price } from "@/lib/finance/types";

function band(overrides: Partial<Allocation> = {}): Allocation {
  return {
    id: "band",
    user_id: "user",
    asset_type: "gold",
    min_percent: 20,
    max_percent: 30,
    formula_version: "v1",
    valid_from: "2026-09-01T00:00:00.000Z",
    valid_to: null,
    ...overrides,
  };
}

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "asset",
    user_id: "user",
    type: "gold",
    symbol: "طلا",
    quantity: 35,
    avg_buy_price: null,
    target_min_weight: null,
    target_max_weight: null,
    risk_level: null,
    manual_value: null,
    price_unit: "rial",
    allocation_class: "gold",
    allocation_class_source: "auto",
    created_at: "2026-09-29T00:00:00.000Z",
    updated_at: "2026-09-29T00:00:00.000Z",
    ...overrides,
  };
}

function quote(overrides: Partial<Price> = {}): Price {
  return {
    id: "price",
    user_id: "user",
    asset_type: "gold",
    symbol: "GOLD18",
    price: 1_000_000,
    source: "tgju-json:geram18",
    timestamp: "2026-09-29T12:00:00.000Z",
    ...overrides,
  };
}

const at = new Date("2026-09-29T12:00:00.000Z");

describe("suggestedRebalancePercent", () => {
  it("suggests the smallest cut back to the top of the band", () => {
    expect(suggestedRebalancePercent(35, 20, 30)).toEqual({
      direction: "reduce",
      shiftPercent: 5,
    });
  });

  it("measures the gap to the band edge, not the midpoint", () => {
    expect(suggestedRebalancePercent(40, 20, 30)).toEqual({
      direction: "reduce",
      shiftPercent: 10,
    });
  });

  it("suggests the smallest increase back to the bottom of the band", () => {
    expect(suggestedRebalancePercent(15, 20, 30)).toEqual({
      direction: "increase",
      shiftPercent: 5,
    });
    expect(suggestedRebalancePercent(10, 20, 30)).toEqual({
      direction: "increase",
      shiftPercent: 10,
    });
  });

  it("stays quiet on the edges and inside the band", () => {
    expect(suggestedRebalancePercent(20, 20, 30)).toBeNull();
    expect(suggestedRebalancePercent(25, 20, 30)).toBeNull();
    expect(suggestedRebalancePercent(30, 20, 30)).toBeNull();
  });

  it("ignores a gap that disappears at the displayed precision", () => {
    expect(suggestedRebalancePercent(30.004, 20, 30)).toBeNull();
    expect(suggestedRebalancePercent(30.006, 20, 30)).toEqual({
      direction: "reduce",
      shiftPercent: 0.01,
    });
  });

  it("rejects an inverted or non-finite band", () => {
    expect(suggestedRebalancePercent(10, 40, 20)).toBeNull();
    expect(suggestedRebalancePercent(Number.NaN, 20, 30)).toBeNull();
  });
});

describe("deviationMessage", () => {
  it("states the weight, the band, and a text-only suggestion", () => {
    expect(
      deviationMessage({
        assetLabel: "طلا",
        weightPercent: 35,
        minPercent: 20,
        maxPercent: 30,
        suggestion: { direction: "reduce", shiftPercent: 5 },
      }),
    ).toBe("وزن طلا ۳۵٪ است، بازه‌ی مجاز ۲۰-۳۰٪، پیشنهاد: کاهش ۵٪");
  });
});

describe("allocationDeviations", () => {
  const snapshot: PortfolioSnapshot = {
    totalValue: 100,
    holdings: [],
    byType: [
      {
        type: "gold",
        value: 35,
        weight: 35,
        minPercent: null,
        maxPercent: null,
        status: "unset",
      },
      {
        type: "cash",
        value: 65,
        weight: 65,
        minPercent: null,
        maxPercent: null,
        status: "unset",
      },
    ],
  };

  it("uses only the band that is valid at that moment", () => {
    const deviations = allocationDeviations(
      snapshot,
      [
        band({ id: "closed", valid_to: "2026-09-01T00:00:00.000Z", min_percent: 0, max_percent: 10 }),
        band({ id: "future", valid_from: "2026-10-01T00:00:00.000Z", min_percent: 0, max_percent: 5 }),
        band({ id: "open", min_percent: 20, max_percent: 30 }),
      ],
      at,
    );

    expect(deviations).toHaveLength(1);
    expect(deviations[0]).toMatchObject({
      assetType: "gold",
      direction: "reduce",
      shiftPercent: 5,
      message: "وزن طلا ۳۵٪ است، بازه‌ی مجاز ۲۰-۳۰٪، پیشنهاد: کاهش ۵٪",
    });
  });

  it("skips types that sit inside the open band", () => {
    expect(allocationDeviations(snapshot, [band({ min_percent: 30, max_percent: 40 })], at)).toEqual([]);
  });

  it("does not invent a weight when the portfolio has no value", () => {
    expect(
      allocationDeviations({ ...snapshot, totalValue: 0, byType: [] }, [band()], at),
    ).toEqual([]);
  });
});

describe("activeAllocations", () => {
  it("keeps the newest overlapping band for a type", () => {
    const rows = activeAllocations(
      [
        band({ id: "older", valid_from: "2026-08-01T00:00:00.000Z", max_percent: 40 }),
        band({ id: "newer", valid_from: "2026-09-15T00:00:00.000Z", max_percent: 30 }),
      ],
      at,
    );
    expect(rows.map((row) => row.id)).toEqual(["newer"]);
  });
});

describe("currentTypeWeights", () => {
  it("weights each asset type from the latest live quote", () => {
    const weights = currentTypeWeights(
      [
        asset({ id: "gold", type: "gold", symbol: "طلا", quantity: 35 }),
        asset({
          id: "cash",
          type: "cash",
          symbol: "نقد",
          quantity: 65,
          manual_value: 1_000_000,
        }),
      ],
      [quote()],
    );

    expect(weights).toEqual([
      { assetType: "cash", value: 65_000_000, weightPercent: 65 },
      { assetType: "gold", value: 35_000_000, weightPercent: 35 },
    ]);
  });
});
