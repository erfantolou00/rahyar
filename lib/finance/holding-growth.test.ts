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
  it("multiplies the basket quantity by each stored daily price", () => {
    expect(
      buildHoldingSeries({
        quantity: 2,
        quotes: [
          { at: "2026-02-01", price: 100 },
          { at: "2026-02-02", price: 150 },
        ],
      }),
    ).toEqual([
      { at: "2026-02-01", value: 200 },
      { at: "2026-02-02", value: 300 },
    ]);
  });

  it("keeps the last price stored for a day", () => {
    expect(
      buildHoldingSeries({
        quantity: 1,
        quotes: [
          { at: "2026-02-01T08:00:00.000Z", price: 100 },
          { at: "2026-02-01T18:00:00.000Z", price: 140 },
        ],
      }),
    ).toEqual([{ at: "2026-02-01", value: 140 }]);
  });

  it("returns no points when the basket quantity is zero", () => {
    expect(
      buildHoldingSeries({
        quantity: 0,
        quotes: [{ at: "2026-02-01", price: 100 }],
      }),
    ).toEqual([]);
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
