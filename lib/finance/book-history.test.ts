import { describe, expect, it } from "vitest";
import { historyCaption, holdingChart, performanceSeries, sincePriorClose } from "@/lib/finance/book-history";

describe("sincePriorClose", () => {
  it("compares the live book with the previous Tehran close", () => {
    const move = sincePriorClose(
      [
        { day: "2026-11-15", value: 100 },
        { day: "2026-11-16", value: 110 },
        { day: "2026-11-17", value: 90 },
      ],
      "2026-11-17",
      121,
    );
    expect(move).toEqual({ absolute: 11, percent: 10 });
  });

  it("stays empty before a second night", () => {
    expect(sincePriorClose([{ day: "2026-11-17", value: 100 }], "2026-11-17", 100)).toBeNull();
  });
});

describe("performanceSeries", () => {
  it("ends on the live value inside the month window", () => {
    const series = performanceSeries([{ day: "2026-11-16", value: 20 }], "2026-11-17", 25, 30);
    expect(series).toEqual([
      { day: "2026-11-16", value: 20 },
      { day: "2026-11-17", value: 25 },
    ]);
  });

  it("keeps an older night when the month has only one mark", () => {
    const series = performanceSeries([{ day: "2026-10-01", value: 10 }], "2026-11-17", 25, 30);
    expect(series.map((point) => point.day)).toEqual(["2026-10-01", "2026-11-17"]);
  });
});

describe("holdingChart", () => {
  it("uses price only when every night has one", () => {
    const chart = holdingChart(
      [
        { day: "2026-11-16", assetId: "a", price: 10, value: 100 },
        { day: "2026-11-15", assetId: "a", price: 8, value: 80 },
      ],
      "2026-11-17",
      { price: 12, value: 120 },
    );
    expect(chart.basis).toBe("price");
    expect(chart.points.map((point) => point.value)).toEqual([8, 10, 12]);
  });

  it("falls back to value when a night has no price", () => {
    const chart = holdingChart(
      [{ day: "2026-11-16", assetId: "a", price: null, value: 100 }],
      "2026-11-17",
      { price: 12, value: 130 },
    );
    expect(chart.basis).toBe("value");
    expect(chart.points.map((point) => point.value)).toEqual([100, 130]);
  });
});

describe("historyCaption", () => {
  it("explains a missing table and a single night", () => {
    expect(historyCaption(0, true)).toContain("پایگاه");
    expect(historyCaption(1, false)).toContain("شب بعد");
  });
});
