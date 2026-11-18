import { describe, expect, it } from "vitest";
import { backfillSymbolHistory, type HistorySources } from "@/lib/finance/codal/backfill";
import { parseMonthlySalesHtml, parseStatementHtml, type CodalLetter, type StatementFigures } from "@/lib/finance/codal/parse";
import { formatNumber } from "@/lib/finance/format";
import {
  MONTHLY_QUANTITY_GAP,
  addRahavardPeriods,
  chooseStatementLetters,
  latestScoreBySymbol,
  monthFromPoint,
  monthlyShortfall,
  periodFromStatement,
  resolvePreviousScore,
} from "@/lib/finance/history";
import type { FinanceClient } from "@/lib/finance/queries";
import { listRahavardStatements } from "@/lib/finance/rahavard/statements";

const statementHtml = `
<table>
  <tr><td>درآمدهاي عملياتي</td><td>۸۳۴</td><td>۱۰۰</td></tr>
  <tr><td>سود (زیان) عملیاتی</td><td>۱۸۰</td></tr>
  <tr><td>سود(زيان) خالص</td><td>۱۲۰</td></tr>
  <tr><td>سود (زيان) خالص هر سهم – ريال</td><td>۶۲</td></tr>
  <tr><td>جمع حقوق مالکانه</td><td>۳,۳۸۲</td></tr>
</table>`;

const notedHtml = `
<table>
  <tr><td>شرح</td><td>یادداشت</td><td>دوره جاری</td></tr>
  <tr><td>درآمدهای عملیاتی</td><td>۵</td><td>۸۳۴</td></tr>
  <tr><td>سود خالص</td><td>۹</td><td>۱۲۰</td></tr>
</table>`;

const wideHtml = `
<table>
  <tr><td>شرح</td><td>دوره منتهی به ۱۴۰۵/۰۶/۳۱</td><td>تجدید ارائه شده دوره منتهی به ۱۴۰۴/۰۶/۳۱</td></tr>
  <tr><td>درآمدهای عملیاتی</td><td>۲۵,۳۷۹,۸۵۷</td><td>۱۰,۵۳۸,۱۳۵</td></tr>
  <tr><td>سود(زیان) خالص</td><td>۶,۲۷۲,۶۳۵</td><td>۳,۹۵۸,۸۵۴</td></tr>
</table>`;

const revisionHtml = `
<table>
  <tr><td>درآمدهای عملیاتی</td><td>۹۰۰</td></tr>
  <tr><td>سود (زیان) خالص</td><td>۱۵۰</td></tr>
</table>`;

const monthlyHtml = `
<table>
  <tr><td>شرح</td><td>دوره یک ماهه منتهی به ۱۴۰۵/۰۶/۳۱</td><td>مبلغ فروش (میلیون ریال)</td></tr>
  <tr><td>جمع</td><td>۱۰</td><td>۱,۸۷۰</td></tr>
</table>`;

function letter(overrides: Partial<CodalLetter> & Pick<CodalLetter, "tracingNo" | "title" | "letterCode">): CodalLetter {
  return { symbol: "فولاد", publishedLabel: "", excelUrl: null, htmlPath: null, ...overrides };
}

function figures(sales: number, netIncome: number): StatementFigures {
  return {
    sales,
    netIncome,
    equity: null,
    periodEps: null,
    operatingProfit: null,
    otherOperatingIncome: null,
    totalAssets: null,
    receivables: null,
    inventory: null,
    priorInventory: null,
    cogs: null,
    retainedEarnings: null,
    priorPeriodSales: null,
  };
}

function memoryDb() {
  const tables: Record<"stock_periods" | "stock_monthly", Record<string, unknown>[]> = {
    stock_periods: [],
    stock_monthly: [],
  };
  const client = {
    from(name: "stock_periods" | "stock_monthly") {
      return {
        upsert(rows: Record<string, unknown>[]) {
          const store = tables[name];
          const key = name === "stock_periods" ? "tracing_no" : "period";
          for (const row of rows) {
            const index = store.findIndex((item) => item.user_id === row.user_id && item.symbol === row.symbol && item[key] === row[key]);
            if (index >= 0) store[index] = { ...row };
            else store.push({ ...row });
          }
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { client: client as unknown as FinanceClient, tables };
}

describe("fundamental history rows", () => {
  const interim = letter({
    tracingNo: 4,
    letterCode: "ن-۱۰",
    title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۶ ماهه منتهی به ۱۴۰۵/۰۶/۳۱ (حسابرسی نشده)",
  });

  it("reads three statement fixtures into period rows with hand-checked amounts", () => {
    const simple = periodFromStatement({
      letter: interim,
      letters: [interim],
      figures: parseStatementHtml(statementHtml),
      source: "excel.codal",
    });
    expect(simple.row).toMatchObject({
      period: "1405/06/31",
      months: 6,
      kind: "interim",
      tracingNo: "4",
      revisionOf: null,
      figures: { sales: 834, netIncome: 120, equity: 3382, periodEps: 62 },
    });

    const noted = periodFromStatement({
      letter: interim,
      letters: [interim],
      figures: parseStatementHtml(notedHtml),
      source: "excel.codal",
    });
    expect(noted.row?.figures.sales).toBe(834);
    expect(noted.row?.figures.netIncome).toBe(120);

    const wide = periodFromStatement({
      letter: interim,
      letters: [interim],
      figures: parseStatementHtml(wideHtml),
      source: "codal.ir:decision",
    });
    expect(wide.row?.figures.sales).toBe(25379857);
    expect(wide.row?.figures.priorPeriodSales).toBe(10538135);
    expect(wide.row?.figures.netIncome).toBe(6272635);
  });

  it("marks a full-year title as annual and keeps the parsed sales", () => {
    const annual = letter({
      tracingNo: 2,
      letterCode: "ن-۱۰",
      title: "صورت‌های مالی سال مالی منتهی به ۱۴۰۴/۱۲/۲۹ (حسابرسی شده)",
    });
    const row = periodFromStatement({
      letter: annual,
      letters: [annual],
      figures: parseStatementHtml(statementHtml),
      source: "excel.codal",
    });
    expect(row.row).toMatchObject({ period: "1404/12/29", months: 12, kind: "annual", figures: { sales: 834 } });
  });

  it("keeps a revision beside the original and points revision_of at tracing 4", () => {
    const revision = letter({
      tracingNo: 6,
      letterCode: "ن-۱۰",
      title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۶ ماهه منتهی به ۱۴۰۵/۰۶/۳۱ (حسابرسی نشده)(اصلاحیه)",
    });
    const older = letter({
      tracingNo: 3,
      letterCode: "ن-۱۰",
      title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۳ ماهه منتهی به ۱۴۰۵/۰۳/۳۱ (حسابرسی نشده)",
    });
    const subsidiary = letter({
      tracingNo: 7,
      letterCode: "ن-۱۰",
      title: "صورت‌های مالی سال مالی منتهی به ۱۴۰۴/۱۲/۲۹ (شرکت فرعی)",
    });
    expect(chooseStatementLetters([subsidiary, older, interim, revision], 1).map((item) => item.tracingNo)).toEqual([interim.tracingNo, revision.tracingNo]);
    const originalRow = periodFromStatement({
      letter: interim,
      letters: [interim, revision],
      figures: parseStatementHtml(statementHtml),
      source: "excel.codal",
    });
    const revisionRow = periodFromStatement({
      letter: revision,
      letters: [interim, revision],
      figures: parseStatementHtml(revisionHtml),
      source: "excel.codal",
    });
    expect(originalRow.row).toMatchObject({ tracingNo: "4", revisionOf: null, figures: { sales: 834, netIncome: 120 } });
    expect(revisionRow.row).toMatchObject({ tracingNo: "6", revisionOf: "4", figures: { sales: 900, netIncome: 150 } });
    expect(revisionRow.gaps).toEqual([]);
  });

  it("leaves monthly quantity fields null and records why", () => {
    const point = parseMonthlySalesHtml(monthlyHtml);
    expect(point).toEqual({ period: "1405/06/31", sales: 1870 });
    expect(monthFromPoint({ period: point.period, sales: point.sales, tracingNo: "9", source: "excel.codal" })).toMatchObject({
      salesValue: 1870,
      salesQty: null,
      productionQty: null,
      avgRate: null,
    });
    expect(MONTHLY_QUANTITY_GAP).toContain("خالی مانده");
    expect(monthlyShortfall(4, 12)).toBe(
      `گزارش ماهانهٔ کدال برای ${formatNumber(12)} ماه کامل نبود؛ ${formatNumber(4)} ماه ذخیره شد.`,
    );
  });

  it("does not replace a Codal period with Rahavard, and scales a missing period from rials", () => {
    const listed = listRahavardStatements({
      interim: {
        data: [{
          date: "2026-09-01",
          fiscal_year: "2026-12-21",
          fiscal_period: 6,
          capital: 1_000_000_000,
          items: [
            { field: { english_title: "Sales Revenue", title: "درآمد حاصل از خدمات و فروش" }, value: 2_000_000_000 },
            { field: { english_title: "Net Earnings (Losses)", title: "سود (زیان) خالص" }, value: 500_000_000 },
          ],
        }],
      },
      annual: { data: [] },
      balance: { data: [] },
    });
    expect(listed).toEqual([
      expect.objectContaining({
        period: "1405/03/31",
        months: 6,
        figures: expect.objectContaining({ sales: 2000, netIncome: 500, periodEps: 500, equity: null }),
      }),
    ]);

    const filled = addRahavardPeriods({
      stored: [{
        period: "1405/06/31",
        months: 6,
        kind: "interim",
        tracingNo: "4",
        revisionOf: null,
        figures: figures(834, 120),
        source: "excel.codal",
      }],
      codalPeriods: ["1405/06/31", "1405/03/31"],
      rahavard: [
        { period: "1405/03/31", months: 3, figures: figures(1_000_000, 10) },
        { period: "1404/12/29", months: 3, figures: figures(500, 40) },
      ],
      quarters: 2,
    });
    expect(filled.added.map((row) => row.period)).toEqual(["1404/12/29"]);
    expect(filled.added[0]).toMatchObject({
      tracingNo: "rahavard:1404/12/29",
      source: "rahavard",
      revisionOf: null,
      figures: { sales: 500, netIncome: 40 },
    });
    expect(filled.gaps).toContain("صورت دورهٔ 1405/03/31 از کدال خوانده نشد.");
    expect(filled.added.some((row) => row.figures.sales === 1_000_000)).toBe(false);
  });

  it("prefers a stored score of 72 over a report score of 40", () => {
    expect(resolvePreviousScore(72, 40)).toBe(72);
    expect(resolvePreviousScore(undefined, 40)).toBe(40);
    expect(resolvePreviousScore(null, 40)).toBeNull();
    const latest = latestScoreBySymbol([
      { symbol: "فولاد", asOf: "2026-10-01T00:00:00.000Z", score: 40 },
      { symbol: "فولاد", asOf: "2026-10-20T00:00:00.000Z", score: 72 },
      { symbol: "شپنا", asOf: "2026-10-20T00:00:00.000Z", score: null },
    ]);
    expect(latest.get("فولاد")).toBe(72);
    expect(latest.get("شپنا")).toBeNull();
  });
});

describe("backfillSymbolHistory", () => {
  const original = letter({
    tracingNo: 4,
    letterCode: "ن-۱۰",
    title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۶ ماهه منتهی به ۱۴۰۵/۰۶/۳۱ (حسابرسی نشده)",
  });
  const revision = letter({
    tracingNo: 6,
    letterCode: "ن-۱۰",
    title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۶ ماهه منتهی به ۱۴۰۵/۰۶/۳۱ (حسابرسی نشده)(اصلاحیه)",
  });
  const monthly = letter({
    tracingNo: 9,
    letterCode: "ن-۳۰",
    title: "گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۶/۳۱",
  });

  function sources(): { feed: HistorySources; rahavardCalls: { n: number } } {
    const rahavardCalls = { n: 0 };
    return {
      rahavardCalls,
      feed: {
        statementLetters: async () => ({ letters: [original, revision], reached: true }),
        monthlyLetters: async () => ({ letters: [monthly], reached: true }),
        readReport: async (item) => {
          if (item.tracingNo === 4) return { html: statementHtml, source: "excel.codal" };
          if (item.tracingNo === 6) return { html: revisionHtml, source: "excel.codal" };
          if (item.tracingNo === 9) return { html: monthlyHtml, source: "excel.codal" };
          return null;
        },
        rahavardStatements: async () => {
          rahavardCalls.n += 1;
          return [];
        },
      },
    };
  }

  it("stores the original and the revision once when backfill runs twice", async () => {
    const db = memoryDb();
    const { feed, rahavardCalls } = sources();
    const first = await backfillSymbolHistory(db.client, "user-1", "فولاد", { quarters: 1, months: 1 }, feed);
    const second = await backfillSymbolHistory(db.client, "user-1", "فولاد", { quarters: 1, months: 1 }, feed);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(rahavardCalls.n).toBe(0);
    expect(db.tables.stock_periods).toHaveLength(2);
    expect(db.tables.stock_monthly).toHaveLength(1);
    const kept = db.tables.stock_periods.find((row) => row.tracing_no === "4");
    const amended = db.tables.stock_periods.find((row) => row.tracing_no === "6");
    expect(kept?.figures).toMatchObject({ sales: 834, netIncome: 120 });
    expect(amended).toMatchObject({ revision_of: "4" });
    expect(amended?.figures).toMatchObject({ sales: 900, netIncome: 150 });
    expect(db.tables.stock_monthly[0]).toMatchObject({
      period: "1405/06/31",
      sales_value: 1870,
      sales_qty: null,
      production_qty: null,
      avg_rate: null,
      tracing_no: "9",
    });
    expect(first.gaps).toContain(MONTHLY_QUANTITY_GAP);
  });

  it("fills only the period Codal did not list, and a second run does not add a row", async () => {
    const db = memoryDb();
    let rahavardCalls = 0;
    const feed: HistorySources = {
      statementLetters: async () => ({ letters: [original], reached: true }),
      monthlyLetters: async () => ({ letters: [], reached: true }),
      readReport: async () => ({ html: statementHtml, source: "excel.codal" }),
      rahavardStatements: async () => {
        rahavardCalls += 1;
        return [{ period: "1404/12/29", months: 3, figures: figures(500, 40) }];
      },
    };
    await backfillSymbolHistory(db.client, "user-1", "فولاد", { quarters: 2, months: 0 }, feed);
    await backfillSymbolHistory(db.client, "user-1", "فولاد", { quarters: 2, months: 0 }, feed);
    expect(rahavardCalls).toBe(2);
    expect(db.tables.stock_periods).toHaveLength(2);
    expect(db.tables.stock_monthly).toHaveLength(0);
    const fromRahavard = db.tables.stock_periods.find((row) => row.source === "rahavard");
    expect(fromRahavard).toMatchObject({
      tracing_no: "rahavard:1404/12/29",
      period: "1404/12/29",
      revision_of: null,
    });
    expect(fromRahavard?.figures).toMatchObject({ sales: 500, netIncome: 40 });
  });
});
