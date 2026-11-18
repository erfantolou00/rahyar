import { describe, expect, it } from "vitest";
import type { Alert, PortfolioSnapshot } from "@/lib/finance/types";
import {
  baselineWeekly,
  buildWeeklyReport,
  formatWeeklySummary,
  parseWeeklyContent,
  shouldCreateWeekly,
  weeklyContentJson,
  withCommentary,
} from "@/lib/finance/weekly";

const now = new Date("2026-10-02T16:30:00.000Z");

function snapshot(total: number, holdingValue: number): PortfolioSnapshot {
  return {
    totalValue: total,
    holdings: [
      {
        id: "gold-1",
        type: "gold",
        symbol: "طلا",
        quantity: 1,
        price: holdingValue,
        usedCostBasis: false,
        value: holdingValue,
        weight: 100,
      },
    ],
    byType: [
      {
        type: "gold",
        value: holdingValue,
        weight: 60,
        minPercent: 10,
        maxPercent: 40,
        status: "above",
      },
    ],
  };
}

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "alert-1",
    user_id: "user",
    rule: "وزن طلا",
    threshold: 20,
    channel: "in_app",
    is_active: true,
    frequency: "immediate",
    kind: "allocation_deviation",
    message: "طلا از سقف گذشت",
    asset_type: "gold",
    created_at: "2026-10-01T10:00:00.000Z",
    sent: true,
    sent_at: "2026-10-01T10:05:00.000Z",
    ...overrides,
  };
}

describe("buildWeeklyReport", () => {
  it("stores numbers and leaves commentary empty when there is no prior week", () => {
    const report = buildWeeklyReport({
      now,
      snapshot: snapshot(150, 150),
      previous: null,
      alerts: [alert(), alert({ id: "old", created_at: "2026-09-01T00:00:00.000Z", sent_at: null, sent: false })],
    });

    expect(report.commentary).toBeNull();
    expect(report.portfolio).toEqual({
      total_value: 150,
      previous_total_value: null,
      change_value: null,
      change_percent: null,
    });
    expect(report.assets[0]).toMatchObject({ pnl_value: null, pnl_percent: null });
    expect(report.alerts.map((item) => item.id)).toEqual(["alert-1"]);
    expect(report.weights[0]).toMatchObject({ status: "above", gap_percent: 20 });
  });

  it("compares each asset and the basket with the previous weekly numbers", () => {
    const previous = buildWeeklyReport({
      now: new Date("2026-09-25T16:30:00.000Z"),
      snapshot: {
        ...snapshot(100, 80),
        holdings: [
          ...snapshot(100, 80).holdings,
          {
            id: "usd-1",
            type: "usd",
            symbol: "دلار",
            quantity: 1,
            price: 20,
            usedCostBasis: false,
            value: 20,
            weight: 20,
          },
        ],
      },
      previous: null,
      alerts: [],
    });
    const report = buildWeeklyReport({
      now,
      snapshot: snapshot(150, 150),
      previous: withCommentary(previous, "متن قدیمی"),
      alerts: [],
    });

    expect(report.portfolio.change_value).toBe(50);
    expect(report.portfolio.change_percent).toBe(50);
    expect(report.assets.find((asset) => asset.id === "gold-1")).toMatchObject({
      previous_value: 80,
      pnl_value: 70,
      pnl_percent: 87.5,
    });
    expect(report.assets.find((asset) => asset.id === "usd-1")).toMatchObject({
      value: 0,
      pnl_value: -20,
    });
    expect(report.commentary).toBeNull();
  });
});

describe("weekly baseline and commentary", () => {
  it("skips a fresh report and uses the one from the prior week", () => {
    const older = buildWeeklyReport({
      now: new Date("2026-09-24T16:30:00.000Z"),
      snapshot: snapshot(100, 100),
      previous: null,
      alerts: [],
    });
    const recent = buildWeeklyReport({
      now: new Date("2026-10-01T16:30:00.000Z"),
      snapshot: snapshot(140, 140),
      previous: older,
      alerts: [],
    });

    expect(shouldCreateWeekly("2026-10-01T16:30:00.000Z", now)).toBe(false);
    expect(shouldCreateWeekly("2026-09-25T16:30:00.000Z", now)).toBe(true);
    expect(
      baselineWeekly(
        [
          { created_at: "2026-10-01T16:30:00.000Z", content: recent },
          { created_at: "2026-09-24T16:30:00.000Z", content: older },
        ],
        now,
      )?.portfolio.total_value,
    ).toBe(100);
  });

  it("keeps the numbers when commentary is attached", () => {
    const report = buildWeeklyReport({
      now,
      snapshot: snapshot(150, 150),
      previous: null,
      alerts: [],
    });
    const withText = withCommentary(report, "  تحلیل مدل  ");
    withText.portfolio.total_value = 1;

    expect(report.portfolio.total_value).toBe(150);
    expect(report.commentary).toBeNull();
    expect(withText.commentary).toBe("تحلیل مدل");
    expect(withCommentary(report, "   ")).toBe(report);
    expect(parseWeeklyContent(weeklyContentJson(withText))?.commentary).toBe("تحلیل مدل");
    const warned = withCommentary(report, "سه خط", ["lines", "numbers"]);
    expect(parseWeeklyContent(weeklyContentJson(warned))?.commentary_warnings).toEqual(["lines", "numbers"]);
    expect(formatWeeklySummary(withText)).not.toContain("تحلیل مدل");
    expect(formatWeeklySummary(withText)).toContain("طلا");
  });
});
