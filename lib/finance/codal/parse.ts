import { normalizeNumericInput } from "@/lib/finance/parse";
import { normalizeSymbol } from "@/lib/finance/prices/match";
import type { Json } from "@/lib/finance/types";

export class CodalShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodalShapeError";
  }
}

export type CodalLetter = {
  tracingNo: number;
  symbol: string;
  title: string;
  letterCode: string;
  publishedLabel: string;
  excelUrl: string | null;
  htmlPath: string | null;
};

export type SalesPoint = {
  period: string;
  sales: number;
};

export type StatementFigures = {
  sales: number;
  netIncome: number;
  equity: number | null;
  periodEps: number | null;
};

export type FundamentalsNumbers = {
  pe: number | null;
  eps: number | null;
  roe: number | null;
  profitMargin: number | null;
};

const LIST_SHAPE = "ساختار فهرست کدال عوض شده؛ فیلد Letters نیست";
const LETTER_SHAPE = "ساختار فهرست کدال عوض شده؛ فیلدهای نامه کامل نیست";
const STATEMENT_SHAPE = "ساختار صورت مالی کدال عوض شده؛ درآمد عملیاتی یا سود خالص پیدا نشد";
const MONTHLY_SHAPE = "ساختار گزارش ماهانه کدال عوض شده؛ مبلغ فروش پیدا نشد";
const PERIOD_SHAPE = "ساختار گزارش ماهانه کدال عوض شده؛ دورهٔ یک‌ماهه پیدا نشد";

export function parseCodalNumber(raw: string): number | null {
  const trimmed = raw.replace(/\u200c/g, "").trim();
  if (!trimmed || trimmed === "--" || trimmed === "-" || trimmed === "ـ") return null;
  const negative = /^\(.*\)$/.test(trimmed);
  const body = negative ? trimmed.slice(1, -1) : trimmed;
  const parsed = Number(normalizeNumericInput(body));
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

export function foldLabel(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[\s\u200c\u00a0_\-–—:：,،.()（）]/g, "")
    .toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseCodalSearch(payload: unknown): CodalLetter[] {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.Letters)) {
    throw new CodalShapeError(LIST_SHAPE);
  }
  if (record.IsAttacker === true && record.Letters.length === 0) {
    throw new Error("codal rejected the request");
  }

  return record.Letters.map((item, index) => {
    const letter = asRecord(item);
    const tracingNo = letter ? Number(letter.TracingNo) : Number.NaN;
    const symbol = letter && typeof letter.Symbol === "string" ? letter.Symbol.trim() : "";
    const title = letter && typeof letter.Title === "string" ? letter.Title.trim() : "";
    if (!letter || !Number.isInteger(tracingNo) || tracingNo <= 0 || !symbol || !title) {
      throw new CodalShapeError(`${LETTER_SHAPE} (${index + 1})`);
    }
    return {
      tracingNo,
      symbol,
      title,
      letterCode: typeof letter.LetterCode === "string" ? letter.LetterCode.trim() : "",
      publishedLabel: typeof letter.PublishDateTime === "string" ? letter.PublishDateTime.trim() : "",
      excelUrl: typeof letter.ExcelUrl === "string" && letter.ExcelUrl.trim() ? letter.ExcelUrl.trim() : null,
      htmlPath: typeof letter.Url === "string" && letter.Url.trim() ? letter.Url.trim() : null,
    };
  });
}

export function lettersForSymbol(letters: CodalLetter[], symbol: string): CodalLetter[] {
  const wanted = normalizeSymbol(symbol);
  return letters.filter((letter) => normalizeSymbol(letter.symbol) === wanted);
}

export function isFinancialStatement(letter: Pick<CodalLetter, "letterCode" | "title">): boolean {
  if (letter.title.includes("شرکت")) return false;
  const title = foldLabel(letter.title);
  if (title.includes("توضیحات")) return false;
  return foldLabel(letter.letterCode) === "ن10" || title.includes("صورتهایمالی");
}

export function isMonthlyActivity(letter: Pick<CodalLetter, "letterCode" | "title">): boolean {
  if (letter.title.includes("شرکت")) return false;
  return foldLabel(letter.letterCode) === "ن30" || foldLabel(letter.title).includes("گزارشفعالیتماهانه");
}

export function isEarningsRevision(letter: Pick<CodalLetter, "letterCode" | "title">): boolean {
  const folded = foldLabel(letter.title);
  if (folded.includes("تعدیل")) return true;
  return isFinancialStatement(letter) && folded.includes("اصلاحیه");
}

export function periodFromTitle(title: string): string | null {
  const match = /منتهیبه(\d{4}\/\d{2}\/\d{2})/.exec(foldLabel(title));
  return match?.[1] ?? null;
}

export function periodMonthsFromTitle(title: string): number | null {
  const folded = foldLabel(title);
  const match = /دوره(\d{1,2})ماهه/.exec(folded);
  if (match?.[1]) {
    const months = Number(match[1]);
    return months >= 1 && months <= 12 ? months : null;
  }
  if (folded.includes("سالمالی")) return 12;
  return null;
}

export function selectStatementLetter(letters: CodalLetter[]): CodalLetter | null {
  return (
    letters
      .filter(isFinancialStatement)
      .sort((left, right) => right.tracingNo - left.tracingNo)[0] ?? null
  );
}

export function selectMonthlyLetters(letters: CodalLetter[], limit = 4): CodalLetter[] {
  const sorted = letters.filter(isMonthlyActivity).sort((left, right) => right.tracingNo - left.tracingNo);
  const byPeriod = new Map<string, CodalLetter>();
  for (const letter of sorted) {
    const period = periodFromTitle(letter.title) ?? `tracing:${letter.tracingNo}`;
    if (!byPeriod.has(period)) byPeriod.set(period, letter);
  }
  return [...byPeriod.values()]
    .sort((left, right) => (periodFromTitle(right.title) ?? "").localeCompare(periodFromTitle(left.title) ?? ""))
    .slice(0, limit);
}

function htmlTables(html: string): string[] {
  const tables: string[] = [];
  const lower = html.toLowerCase();
  let index = 0;
  while (index < html.length) {
    const start = lower.indexOf("<table", index);
    if (start < 0) break;
    let depth = 0;
    let cursor = start;
    let closed = false;
    while (cursor < html.length) {
      const nextOpen = lower.indexOf("<table", cursor);
      const nextClose = lower.indexOf("</table", cursor);
      if (nextClose < 0) return tables;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth += 1;
        cursor = nextOpen + 6;
        continue;
      }
      depth -= 1;
      cursor = nextClose + 8;
      if (depth === 0) {
        const end = lower.indexOf(">", nextClose);
        if (end < 0) return tables;
        tables.push(html.slice(start, end + 1));
        index = end + 1;
        closed = true;
        break;
      }
    }
    if (!closed) break;
  }
  return tables;
}

function tableRows(html: string): string[][] {
  const rows: string[][] = [];
  for (const match of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const cells = [...match[0].matchAll(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi)].map((cell) =>
      cell[0]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim(),
    );
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function documentRows(html: string): string[][] {
  const tables = htmlTables(html);
  return (tables.length > 0 ? tables : [html]).flatMap(tableRows);
}

function firstAmount(cells: string[]): number | null {
  for (const cell of cells.slice(1)) {
    const value = parseCodalNumber(cell);
    if (value != null) return value;
  }
  return null;
}

function findRow(rows: string[][], predicate: (label: string) => boolean): string[] | null {
  for (const row of rows) {
    const label = foldLabel(row[0] ?? "");
    if (label && predicate(label)) return row;
  }
  return null;
}

export function parseStatementHtml(html: string): StatementFigures {
  const rows = documentRows(html);
  const salesRow = findRow(rows, (label) => label === "درآمدهایعملیاتی");
  const netRow = findRow(rows, (label) => label === "سودزیانخالص");
  const sales = salesRow ? firstAmount(salesRow) : null;
  const netIncome = netRow ? firstAmount(netRow) : null;
  if (sales == null || netIncome == null) throw new CodalShapeError(STATEMENT_SHAPE);

  const epsRow =
    findRow(rows, (label) => label.includes("هرسهم") && label.includes("خالص")) ??
    findRow(rows, (label) => label.includes("هرسهم") && label.includes("پایه"));
  const equityRow = findRow(rows, (label) => label === "جمعحقوقمالکانه");

  return {
    sales,
    netIncome,
    equity: equityRow ? firstAmount(equityRow) : null,
    periodEps: epsRow ? firstAmount(epsRow) : null,
  };
}

function largestAmount(cells: string[]): number | null {
  let best: number | null = null;
  for (const cell of cells) {
    const value = parseCodalNumber(cell);
    if (value == null) continue;
    if (best == null || Math.abs(value) > Math.abs(best)) best = value;
  }
  return best;
}

export function parseMonthlySalesHtml(html: string, title = ""): SalesPoint {
  const tables = htmlTables(html);
  if (tables.length === 0) throw new CodalShapeError(MONTHLY_SHAPE);

  for (const table of tables) {
    const rows = tableRows(table);
    const header = rows.find((row) => row.some((cell) => foldLabel(cell).includes("مبلغفروش")));
    const total = rows.find((row) => foldLabel(row[0] ?? "") === "جمع");
    if (!header || !total) continue;
    const column = header.findIndex((cell) => foldLabel(cell).includes("مبلغفروش"));
    const aligned = column >= 0 ? parseCodalNumber(total[column] ?? "") : null;
    const sales = aligned ?? largestAmount(total.slice(1));
    if (sales == null) continue;
    const periodCell = rows.flat().find((cell) => foldLabel(cell).includes("یکماهه"));
    const period = (periodCell ? periodFromTitle(periodCell) : null) ?? periodFromTitle(title);
    if (!period) throw new CodalShapeError(PERIOD_SHAPE);
    return { period, sales };
  }

  throw new CodalShapeError(MONTHLY_SHAPE);
}

/** Interim amounts are scaled to twelve months so ROE and EPS stay comparable with a full year. */
export function annualizedAmount(amount: number, months: number | null): number {
  if (months == null || months <= 0 || months >= 12) return amount;
  return (amount * 12) / months;
}

export function assembleFundamentals(input: {
  sales: number | null;
  netIncome: number | null;
  equity: number | null;
  periodEps: number | null;
  months: number | null;
  marketEps: number | null;
  price: number | null;
}): FundamentalsNumbers {
  const profitMargin =
    input.sales != null && input.netIncome != null && input.sales !== 0
      ? (input.netIncome / input.sales) * 100
      : null;
  const roe =
    input.netIncome != null && input.equity != null && input.equity !== 0
      ? (annualizedAmount(input.netIncome, input.months) / input.equity) * 100
      : null;
  const statementEps = input.periodEps == null ? null : annualizedAmount(input.periodEps, input.months);
  const eps = input.marketEps != null && input.marketEps > 0 ? input.marketEps : statementEps != null && statementEps > 0 ? statementEps : null;
  const pe = input.price != null && eps != null && input.price > 0 && eps > 0 ? input.price / eps : null;
  return { pe, eps, roe, profitMargin };
}

export function epsMeaningfullyChanged(previous: number | null, next: number | null): boolean {
  if (previous == null || next == null) return false;
  if (previous === 0) return next !== 0;
  return Math.abs(next - previous) / Math.abs(previous) > 0.01;
}

export function mergeSalesTrend(existing: SalesPoint[], incoming: SalesPoint[]): SalesPoint[] {
  const byPeriod = new Map<string, SalesPoint>();
  for (const point of existing) {
    if (point.period && Number.isFinite(point.sales)) byPeriod.set(point.period, point);
  }
  for (const point of incoming) {
    if (point.period && Number.isFinite(point.sales)) byPeriod.set(point.period, point);
  }
  return [...byPeriod.values()].sort((left, right) => left.period.localeCompare(right.period)).slice(-12);
}

export function readSalesTrend(value: Json): SalesPoint[] {
  if (!Array.isArray(value)) return [];
  const points: SalesPoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const period = "period" in item && typeof item.period === "string" ? item.period : "";
    const raw = "sales" in item ? item.sales : null;
    const sales = typeof raw === "number" || typeof raw === "string" ? Number(raw) : Number.NaN;
    if (!period || !Number.isFinite(sales)) continue;
    points.push({ period, sales });
  }
  return points;
}
