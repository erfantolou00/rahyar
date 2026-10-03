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
  parseMonthlySalesHtml,
  parseStatementHtml,
  selectMonthlyLetters,
  selectStatementLetter,
  type CodalLetter,
} from "@/lib/finance/codal/parse";

const statementHtml = `
<table>
  <tr><td>درآمدهاي عملياتي</td><td>۸۳۴</td><td>۱۰۰</td></tr>
  <tr><td>بهاى تمام شده درآمدهاي عملياتي</td><td>(۶۰۱)</td></tr>
  <tr><td>سود(زيان) خالص</td><td>۱۲۰</td><td>۲۰۰</td></tr>
  <tr><td>سود(زيان) خالص عمليات در حال تداوم</td><td>۹۹۹</td></tr>
  <tr><td>سود (زيان) خالص هر سهم – ريال</td><td>۶۲</td></tr>
  <tr><td>جمع حقوق مالکانه</td><td>۳,۳۸۲</td></tr>
  <tr><td>جمع حقوق مالکانه و بدهي‌ها</td><td>۹,۹۹۹</td></tr>
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
    });
    expect(parseCodalNumber("(۶۰۱,۵۰۸)")).toBe(-601508);
  });

  it("throws when the statement labels are gone", () => {
    expect(() => parseStatementHtml("<table><tr><td>نام</td><td>۱</td></tr></table>")).toThrow(CodalShapeError);
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

  it("keeps the issuer statement and the corrected monthly letter", () => {
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
