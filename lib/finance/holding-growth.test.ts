import { describe, expect, it } from "vitest";
import { buildHoldingSeries, dayKey, shiftDays, sliceGrowth } from "@/lib/finance/holding-growth";

describe("dayKey", () => {
  it("keeps a date-only value", () => {
    expect(dayKey("2026-01-15")).toBe("2026-01-15");
  });

  it("uses the Tehran calendar day for timestamps", () => {
    expect(dayKey("2026-01-05T20:30:00.000Z")).toBe("2026-01-06");
  });
});

describe("shiftDays", () => {
  it("crosses month boundaries", () => {
    expect(shiftDays("2026-03-01", 1)).toBe("2026-02-28");
  });
});

describe("buildHoldingSeries", () => {
  it("marks the position to market from trades and later quotes", () => {
    const series = buildHoldingSeries({
      quantity: 6,
      trades: [
        { at: "2026-01-01", type: "buy", qty: 10, price: 100 },
        { at: "2026-01-10", type: "sell", qty: 4, price: 150 },
      ],
      quotes: [
        { at: "2026-01-01", price: 100 },
        { at: "2026-01-05", price: 120 },
        { at: "2026-01-10", price: 140 },
        { at: "2026-01-20", price: 200 },
      ],
    });

    expect(series.basis).toBe("trades");
    expect(series.points).toEqual([
      { at: "2026-01-01", value: 1000 },
      { at: "2026-01-05", value: 1200 },
      { at: "2026-01-10", value: 840 },
      { at: "2026-01-20", value: 1200 },
    ]);
  });

  it("drops to zero after the position is closed and does not keep drawing zeros", () => {
    const series = buildHoldingSeries({
      quantity: 0,
      trades: [
        { at: "2026-01-01", type: "buy", qty: 2, price: 50 },
        { at: "2026-01-03", type: "sell", qty: 2, price: 80 },
      ],
      quotes: [
        { at: "2026-01-04", price: 90 },
        { at: "2026-01-05", price: 95 },
      ],
    });

    expect(series.points.map((point) => point.value)).toEqual([100, 0]);
  });

  it("uses the current quantity when there are no trades", () => {
    const series = buildHoldingSeries({
      quantity: 2,
      trades: [],
      quotes: [
        { at: "2026-02-01", price: 100 },
        { at: "2026-02-02", price: 150 },
      ],
    });

    expect(series.basis).toBe("quantity");
    expect(series.points).toEqual([
      { at: "2026-02-01", value: 200 },
      { at: "2026-02-02", value: 300 },
    ]);
  });
});

describe("sliceGrowth", () => {
  const points = [
    { at: "2026-01-01", value: 1000 },
    { at: "2026-01-10", value: 840 },
    { at: "2026-01-20", value: 1200 },
  ];

  it("carries the last value into the window", () => {
    const slice = sliceGrowth(points, 7, "2026-01-20");
    expect(slice.points[0]).toEqual({ at: "2026-01-13", value: 840 });
    expect(slice.endValue).toBe(1200);
    expect(slice.change).toBe(360);
    expect(slice.changePercent).toBe(42.86);
  });

  it("measures the whole series", () => {
    const slice = sliceGrowth(points, null, "2026-01-20");
    expect(slice.startValue).toBe(1000);
    expect(slice.changePercent).toBe(20);
  });

  it("returns an empty slice when nothing is known", () => {
    expect(sliceGrowth([], 30, "2026-01-20").points).toEqual([]);
  });
});
