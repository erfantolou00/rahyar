import { describe, expect, it } from "vitest";
import { codalUrl } from "@/lib/finance/codal/fetch";
import {
  CodalShapeError,
  assembleFundamentals,
  epsMeaningfullyChanged,
  isEarningsRevision,
  mergeSalesTrend,
  parseCodalNumber,
  parseCodalSearch,
  parseCodalSearchXml,
  parseDividendPerShare,
  parseMonthlySalesHtml,
  parseStatementHtml,
  preferMonthlyDownloads,
  selectFisStatementLetters,
  selectMonthlyLetters,
  selectStatementLetter,
  type CodalLetter,
} from "@/lib/finance/codal/parse";

const statementHtml = `
<table>
  <tr><td>درآمدهاي عملياتي</td><td>۸۳۴</td><td>۱۰۰</td></tr>
  <tr><td>بهاى تمام شده درآمدهاي عملياتي</td><td>(۶۰۱)</td></tr>
  <tr><td>سود (زیان) عملیاتی</td><td>۱۸۰</td></tr>
  <tr><td>سایر درآمدهای عملیاتی</td><td>۲۰</td></tr>
  <tr><td>سود(زيان) خالص</td><td>۱۲۰</td><td>۲۰۰</td></tr>
  <tr><td>سود(زيان) خالص عمليات در حال تداوم</td><td>۹۹۹</td></tr>
  <tr><td>سود (زيان) خالص هر سهم – ريال</td><td>۶۲</td></tr>
  <tr><td>جمع حقوق مالکانه</td><td>۳,۳۸۲</td></tr>
  <tr><td>جمع حقوق مالکانه و بدهي‌ها</td><td>۹,۹۹۹</td></tr>
  <tr><td>جمع دارایی‌ها</td><td>۵,۰۰۰</td></tr>
  <tr><td>دریافتنی‌های تجاری</td><td>۴۰۰</td></tr>
  <tr><td>موجودی مواد و کالا</td><td>۹۰</td><td>۷۰</td></tr>
  <tr><td>سود انباشته</td><td>۳۰۰</td></tr>
</table>`;

const monthlyHtml = `
<table>
  <tr><td>شرح</td><td>دوره یک ماهه منتهی به ۱۴۰۵/۰۶/۳۱</td><td>مبلغ فروش (میلیون ریال)</td></tr>
  <tr><td>جمع</td><td>۱۰</td><td>۱,۸۷۰</td></tr>
</table>`;

function letter(overrides: Partial<CodalLetter> & Pick<CodalLetter, "tracingNo" | "title" | "letterCode">): CodalLetter {
  return {
    symbol: "فولاد",
    publishedLabel: "",
    excelUrl: null,
    htmlPath: null,
    ...overrides,
  };
}

describe("parseCodalSearch", () => {
  it("reads letters and ignores a hostile empty payload by throwing", () => {
    const letters = parseCodalSearch({
      Letters: [
        {
          TracingNo: 1605314,
          Symbol: "فولاد",
          Title: "گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۶/۳۱",
          LetterCode: "ن-۳۰",
          PublishDateTime: "۱۴۰۵/۰۷/۰۷ ۱۸:۵۵:۳۴",
          ExcelUrl: "https://excel.codal.ir/service/Excel/GetAll/abc/0",
          Url: "/Reports/Decision.aspx?LetterSerial=abc",
        },
      ],
    });
    expect(letters).toEqual([
      {
        tracingNo: 1605314,
        symbol: "فولاد",
        title: "گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۶/۳۱",
        letterCode: "ن-۳۰",
        publishedLabel: "۱۴۰۵/۰۷/۰۷ ۱۸:۵۵:۳۴",
        excelUrl: "https://excel.codal.ir/service/Excel/GetAll/abc/0",
        htmlPath: "/Reports/Decision.aspx?LetterSerial=abc",
      },
    ]);
  });

  it("throws when the search payload no longer has Letters", () => {
    expect(() => parseCodalSearch({ Total: 12 })).toThrow(CodalShapeError);
    expect(() => parseCodalSearch({ Letters: [{ TracingNo: 1 }] })).toThrow(/فیلدهای نامه/);
  });

  it("rejects an attacker response so another source can run", () => {
    expect(() => parseCodalSearch({ IsAttacker: true, Letters: [] })).toThrow(/rejected/);
  });
});

describe("Codal statement and monthly parsers", () => {
  it("reads sales, net income, EPS and equity from the statement table", () => {
    expect(parseStatementHtml(statementHtml)).toEqual({
      sales: 834,
      netIncome: 120,
      equity: 3382,
      periodEps: 62,
      operatingProfit: 180,
      otherOperatingIncome: 20,
      totalAssets: 5000,
      receivables: 400,
      inventory: 90,
      priorInventory: 70,
      cogs: -601,
      retainedEarnings: 300,
      priorPeriodSales: null,
    });
    expect(parseCodalNumber("(۶۰۱,۵۰۸)")).toBe(-601508);
  });

  it("throws when the statement labels are gone", () => {
    expect(() => parseStatementHtml("<table><tr><td>نام</td><td>۱</td></tr></table>")).toThrow(CodalShapeError);
  });

  it("skips the note column and reads the label wherever it sits in the row", () => {
    const html = `
      <table>
        <tr><td>شرح</td><td>یادداشت</td><td>دوره جاری</td><td>دوره قبل</td></tr>
        <tr><td>درآمدهای عملیاتی</td><td>۵</td><td>۸۳۴</td><td>۱۰۰</td></tr>
        <tr><td>ستون دیگر</td><td>سود خالص</td><td>۱۲۰</td><td>۹۰</td></tr>
      </table>`;
    const figures = parseStatementHtml(html);
    expect(figures.sales).toBe(834);
    expect(figures.netIncome).toBe(120);
  });

  it("reads an investment statement that has no operating-revenue line", () => {
    const html = `
      <table>
        <tr><td>جمع درآمدها</td><td>۵۰۰</td></tr>
        <tr><td>سود (زیان) خالص عملیات در حال تداوم</td><td>۷۰</td></tr>
        <tr><td>سود خالص</td><td>۸۰</td></tr>
        <tr><td>جمع حقوق صاحبان سهام</td><td>۹۰۰</td></tr>
      </table>`;
    const figures = parseStatementHtml(html);
    expect(figures.sales).toBe(500);
    expect(figures.netIncome).toBe(80);
    expect(figures.equity).toBe(900);
  });

  it("reads the income statement instead of the later equity rollforward", () => {
    const html = `
      <table>
        <tr><td>شرح</td><td>دوره منتهی به ۱۴۰۵/۰۶/۳۱</td><td>تجدید ارائه شده دوره منتهی به ۱۴۰۴/۰۶/۳۱</td><td>درصد تغییر</td></tr>
        <tr><td>درآمدهای عملیاتی</td><td>۲۵,۳۷۹,۸۵۷</td><td>۱۰,۵۳۸,۱۳۵</td><td>۱۴۱</td></tr>
        <tr><td>بهای تمام شده درآمدهای عملیاتی</td><td>(۱۴,۲۹۹,۳۱۲)</td></tr>
        <tr><td>سایر درآمدها</td><td>۳۰۸,۸۷۹</td></tr>
        <tr><td>سود(زیان) عملیاتی</td><td>۱۰,۶۳۸,۷۸۰</td></tr>
        <tr><td>سود(زیان) پایه هر سهم:</td></tr>
        <tr><td>سود(زیان) پایه هر سهم</td><td>۱,۱۶۱</td></tr>
        <tr><td>سود (زیان) خالص هر سهم – ریال</td><td>۱,۱۶۲</td></tr>
        <tr><td>سود(زیان) خالص</td><td>۶,۲۷۲,۶۳۵</td><td>۳,۹۵۸,۸۵۴</td><td>۵۰,۲۸۷,۱۴۹</td></tr>
      </table>
      <table>
        <tr><td>سود(زیان) خالص گزارش شده در صورت‌های مالی سال ۱۴۰۴/۰۹/۳۰</td><td>۵۰,۲۸۷,۱۴۹</td></tr>
        <tr><td>سود (زیان) خالص در دوره ۹ ماهه منتهی به ۱۴۰۵/۰۶/۳۱</td><td>۶,۲۷۲,۶۳۵</td></tr>
      </table>
      <table>
        <tr><td>دریافتنی‌های تجاری و سایر دریافتنی‌ها</td><td>۱۶,۳۵۸,۸۱۹</td></tr>
        <tr><td>موجودی مواد و کالا</td><td>۴,۸۹۳,۱۸۶</td><td>۱,۴۱۹,۸۸۲</td></tr>
        <tr><td>سود(زیان) انباشته</td><td>۱۲,۷۸۷,۵۲۵</td></tr>
        <tr><td>جمع حقوق مالکانه</td><td>۱۸,۷۲۷,۵۲۵</td></tr>
        <tr><td>جمع دارایی‌ها</td><td>۳۶,۴۰۹,۲۰۵</td></tr>
      </table>`;
    expect(parseStatementHtml(html)).toMatchObject({
      sales: 25379857,
      priorPeriodSales: 10538135,
      cogs: -14299312,
      otherOperatingIncome: 308879,
      operatingProfit: 10638780,
      netIncome: 6272635,
      periodEps: 1162,
      receivables: 16358819,
      inventory: 4893186,
      priorInventory: 1419882,
      retainedEarnings: 12787525,
      equity: 18727525,
      totalAssets: 36409205,
    });
  });

  it("uses the separate statement when the consolidated one comes first", () => {
    const html = `
      <table>
        <tr><td>درآمدهای عملیاتی</td><td>۹۹۹۹</td></tr>
        <tr><td>سود (زیان) خالص</td><td>۸۸۸</td></tr>
      </table>
      <table>
        <tr><td>درآمدهای عملیاتی</td><td>۸۳۴</td></tr>
        <tr><td>سود (زیان) خالص</td><td>۱۲۰</td></tr>
      </table>`;
    const figures = parseStatementHtml(html);
    expect(figures.sales).toBe(834);
    expect(figures.netIncome).toBe(120);
  });

  it("reads the monthly sales column and the period in the header", () => {
    expect(parseMonthlySalesHtml(monthlyHtml)).toEqual({ period: "1405/06/31", sales: 1870 });
  });

  it("throws when the monthly sales table has no total", () => {
    expect(() => parseMonthlySalesHtml("<table><tr><td>شرح</td></tr></table>")).toThrow(/مبلغ فروش/);
  });
});

describe("Codal letter selection", () => {
  const letters = [
    letter({
      tracingNo: 3,
      letterCode: "ن-۱۰",
      title: "صورت‌های مالی سال مالی منتهی به ۱۴۰۴/۱۲/۲۹ (حسابرسی شده) (شرکت فرهنگی ورزشی فولاد)",
    }),
    letter({
      tracingNo: 4,
      letterCode: "ن-۲۶",
      title: "توضیحات در خصوص اطلاعات و صورت های مالی منتشر شده",
    }),
    letter({
      tracingNo: 8,
      letterCode: "ن-۱۰",
      title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۳ ماهه منتهی به ۱۴۰۵/۰۳/۳۱ (حسابرسی نشده)",
    }),
    letter({
      tracingNo: 5,
      letterCode: "ن-۳۰",
      title: "گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۵/۳۱",
    }),
    letter({
      tracingNo: 9,
      letterCode: "ن-۳۰",
      title: "گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۵/۳۱(اصلاحیه)",
    }),
  ];

  it("keeps the issuer statement, the prior periods, and the corrected monthly letter", () => {
    expect(selectStatementLetter(letters)?.tracingNo).toBe(8);
    expect(selectMonthlyLetters(letters).map((item) => item.tracingNo)).toEqual([9]);
    expect(isEarningsRevision(letters[4] ?? letters[0])).toBe(false);
    expect(
      isEarningsRevision(
        letter({
          tracingNo: 11,
          letterCode: "ن-۱۰",
          title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۳ ماهه منتهی به ۱۴۰۵/۰۳/۳۱ (حسابرسی نشده)(اصلاحیه)",
        }),
      ),
    ).toBe(true);
  });

  it("chooses the latest statement, the prior interim, last year, and two annuals", () => {
    const chosen = selectFisStatementLetters([
      letter({ tracingNo: 1, letterCode: "ن-۱۰", title: "صورت‌های مالی سال مالی منتهی به ۱۴۰۳/۱۲/۲۹ (حسابرسی شده)" }),
      letter({ tracingNo: 2, letterCode: "ن-۱۰", title: "صورت‌های مالی سال مالی منتهی به ۱۴۰۴/۱۲/۲۹ (حسابرسی شده)" }),
      letter({ tracingNo: 3, letterCode: "ن-۱۰", title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۳ ماهه منتهی به ۱۴۰۵/۰۳/۳۱ (حسابرسی نشده)" }),
      letter({ tracingNo: 4, letterCode: "ن-۱۰", title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۶ ماهه منتهی به ۱۴۰۵/۰۶/۳۱ (حسابرسی نشده)" }),
      letter({ tracingNo: 6, letterCode: "ن-۱۰", title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۶ ماهه منتهی به ۱۴۰۵/۰۶/۳۱ (حسابرسی نشده)(اصلاحیه)" }),
      letter({ tracingNo: 5, letterCode: "ن-۱۰", title: "اطلاعات و صورت‌های مالی میاندوره‌ای دوره ۶ ماهه منتهی به ۱۴۰۴/۰۶/۳۱ (حسابرسی نشده)" }),
      letter({ tracingNo: 7, letterCode: "ن-۱۰", title: "صورت‌های مالی سال مالی منتهی به ۱۴۰۴/۱۲/۲۹ (شرکت فرعی)" }),
    ]);
    expect(chosen.map((item) => [item.role, item.letter.tracingNo])).toEqual([
      ["latest", 6],
      ["prior-interim", 3],
      ["same-period-last-year", 5],
      ["annual", 2],
      ["prior-annual", 1],
    ]);
  });

  it("reads a dividend per share and an XML letter list", () => {
    const html = `<table><tr><td>سود نقدی هر سهم</td><td>۲۴۰</td></tr></table>`;
    expect(parseDividendPerShare(html)).toBe(240);
    const letters = parseCodalSearchXml(`
      <Letters><CodalLetterHeaderDto>
        <TracingNo>1605314</TracingNo><Symbol>فولاد</Symbol>
        <Title>گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۶/۳۱</Title>
        <LetterCode>ن-۳۰</LetterCode><PublishDateTime>۱۴۰۵/۰۷/۰۷</PublishDateTime>
        <ExcelUrl>https://excel.codal.ir/service/Excel/GetAll/abc/0</ExcelUrl>
        <Url>/Reports/Decision.aspx?LetterSerial=abc</Url>
      </CodalLetterHeaderDto></Letters>`);
    expect(letters[0]?.tracingNo).toBe(1605314);
    expect(letters[0]?.letterCode).toBe("ن-۳۰");
  });

  it("downloads the newest month and the same month last year before older gaps", () => {
    const monthly = [
      letter({ tracingNo: 1, letterCode: "ن-۳۰", title: "گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۴/۰۶/۳۱" }),
      letter({ tracingNo: 2, letterCode: "ن-۳۰", title: "گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۵/۳۱" }),
      letter({ tracingNo: 3, letterCode: "ن-۳۰", title: "گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۶/۳۱" }),
    ];
    expect(preferMonthlyDownloads(monthly, ["1405/06/31"], 2).map((item) => item.tracingNo)).toEqual([1, 2]);
  });
});

describe("assembleFundamentals", () => {
  it("annualizes a quarter and prefers the market EPS for P/E", () => {
    expect(
      assembleFundamentals({
        sales: 200,
        netIncome: 50,
        equity: 400,
        periodEps: 10,
        months: 3,
        marketEps: 40,
        price: 200,
      }),
    ).toEqual({ pe: 5, eps: 40, roe: 50, profitMargin: 25 });
  });

  it("uses annualized statement EPS when the exchange has none", () => {
    const numbers = assembleFundamentals({
      sales: 200,
      netIncome: 50,
      equity: 400,
      periodEps: 10,
      months: 3,
      marketEps: null,
      price: 200,
    });
    expect(numbers.eps).toBe(40);
    expect(numbers.pe).toBe(5);
  });

  it("treats a small EPS move as unchanged and a real one as a revision", () => {
    expect(epsMeaningfullyChanged(100, 100.5)).toBe(false);
    expect(epsMeaningfullyChanged(100, 120)).toBe(true);
    expect(mergeSalesTrend([{ period: "1405/05/31", sales: 10 }], [{ period: "1405/05/31", sales: 12 }, { period: "1405/06/31", sales: 8 }])).toEqual([
      { period: "1405/05/31", sales: 12 },
      { period: "1405/06/31", sales: 8 },
    ]);
  });
});

describe("codalUrl", () => {
  it("allows Codal hosts and drops anything else", () => {
    expect(codalUrl("https://excel.codal.ir/service/Excel/GetAll/abc/0")).toContain("excel.codal.ir");
    expect(codalUrl("/Reports/Decision.aspx?LetterSerial=abc")).toContain("https://www.codal.ir/");
    expect(codalUrl("https://evil.example/report")).toBeNull();
    expect(codalUrl("http://excel.codal.ir/file")).toBeNull();
  });
});
