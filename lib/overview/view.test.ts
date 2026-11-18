import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { liveOverviewSource } from "@/lib/overview/live";
import { sampleOverviewSource } from "@/lib/overview/sample";
import { buildOverviewView, seriesMove } from "@/lib/overview/view";

describe("sample overview", () => {
  it("fills the three kpis, allocation and a rising month", () => {
    const view = buildOverviewView(sampleOverviewSource("preview"));
    expect(view.sample).toBe(true);
    expect(view.kpis.map((kpi) => kpi.id)).toEqual(["total", "today", "total-return"]);
    expect(view.kpis[0]?.unit).toBe("میلیارد ریال");
    expect(view.kpis[1]?.valueTone).toBe("profit");
    expect(view.kpis[1]?.unit).toBe("میلیون ریال");
    expect(view.kpis[2]?.delta?.tone).toBe("profit");
    expect(view.slices.length).toBe(5);
    expect(view.series.length).toBe(30);
    expect(view.seriesDelta?.tone).toBe("profit");
    const html = renderToStaticMarkup(createElement(OverviewDashboard, { view }));
    expect(html).toContain("ارزش کل سبد");
    expect(html).toContain("ترکیب دارایی");
    expect(html).toContain("عملکرد سبد");
    expect(html).toContain("هشدارهای فعال");
    expect(html).toContain("آخرین معاملات");
    expect(html).toContain("<svg");
    const weight = view.slices.reduce((sum, slice) => sum + slice.weight, 0);
    expect(weight).toBeCloseTo(100, 5);
  });
});

describe("live overview", () => {
  it("drops flat classes and allocation-deviation alerts", () => {
    const view = buildOverviewView(
      liveOverviewSource({
        totalValue: 100,
        holdingsCount: 1,
        totalAbsolute: -5,
        totalPercent: -5,
        todayAbsolute: null,
        todayPercent: null,
        series: [],
        seriesCaption: "هنوز ارزش شبانه‌ای ثبت نشده است.",
        byType: [
          { type: "stock", value: 100, weight: 100, minPercent: null, maxPercent: null, status: "unset" },
          { type: "gold", value: 0, weight: 0, minPercent: 10, maxPercent: 20, status: "below" },
        ],
        alerts: [
          {
            id: "dev",
            kind: "allocation_deviation",
            is_active: true,
            rule: "انحراف",
            threshold: 1,
            channel: "in_app",
            frequency: "daily",
          },
          {
            id: "rule",
            kind: "rule",
            is_active: true,
            rule: "طلا",
            threshold: 10,
            channel: "push",
            frequency: "immediate",
          },
          {
            id: "off",
            kind: "rule",
            is_active: false,
            rule: "خاموش",
            threshold: 1,
            channel: "in_app",
            frequency: "off",
          },
        ],
        transactions: [],
        symbols: new Map(),
      }),
    );

    expect(view.sample).toBe(false);
    expect(view.slices.map((slice) => slice.id)).toEqual(["stock"]);
    expect(view.alerts.map((alert) => alert.title)).toEqual(["طلا"]);
    expect(view.kpis[2]?.valueTone).toBe("loss");
    expect(view.kpis[1]?.value).toBe("—");
    expect(view.seriesDelta).toBeNull();
    expect(view.tradesNote).toBe("تراکنشی ثبت نشده است.");
  });
});

describe("seriesMove", () => {
  it("needs two points and a positive start", () => {
    expect(seriesMove([])).toBeNull();
    expect(seriesMove([{ value: 0 }, { value: 10 }])).toBeNull();
    expect(seriesMove([{ value: 100 }, { value: 80 }])).toEqual({ absolute: -20, percent: -20 });
  });
});
