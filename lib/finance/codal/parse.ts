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
  sales: number | null;
  netIncome: number;
  equity: number | null;
  periodEps: number | null;
  operatingProfit: number | null;
  otherOperatingIncome: number | null;
  totalAssets: number | null;
  receivables: number | null;
  inventory: number | null;
  priorInventory: number | null;
  cogs: number | null;
  retainedEarnings: number | null;
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
    .replace(/ى/g, "ی")
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

export type FisStatementRole = "latest" | "prior-interim" | "same-period-last-year" | "annual" | "prior-annual";

export type ChosenStatement = { letter: CodalLetter; role: FisStatementRole };

function shiftPeriodYear(period: string, years: number): string | null {
  const match = /^(\d{4})\/(\d{2}\/\d{2})$/.exec(period);
  if (!match) return null;
  return `${Number(match[1]) + years}/${match[2]}`;
}

function statementsByPeriod(letters: CodalLetter[]): CodalLetter[] {
  const sorted = letters.filter(isFinancialStatement).sort((left, right) => right.tracingNo - left.tracingNo);
  const byPeriod = new Map<string, CodalLetter>();
  for (const letter of sorted) {
    const period = periodFromTitle(letter.title) ?? `tracing:${letter.tracingNo}`;
    if (!byPeriod.has(period)) byPeriod.set(period, letter);
  }
  return [...byPeriod.values()].sort((left, right) => (periodFromTitle(right.title) ?? "").localeCompare(periodFromTitle(left.title) ?? ""));
}

export function selectFisStatementLetters(letters: CodalLetter[]): ChosenStatement[] {
  const statements = statementsByPeriod(letters);
  const latest = statements[0];
  if (!latest) return [];
  const latestPeriod = periodFromTitle(latest.title);
  const latestMonths = periodMonthsFromTitle(latest.title);
  const year = latestPeriod?.slice(0, 4) ?? null;
  const priorInterim = year == null || latestMonths == null
    ? null
    : statements.find((letter) => {
      const period = periodFromTitle(letter.title);
      const months = periodMonthsFromTitle(letter.title);
      return period?.startsWith(`${year}/`) && months != null && months < latestMonths;
    }) ?? null;
  const sameLastYear = latestPeriod == null
    ? null
    : statements.find((letter) => periodFromTitle(letter.title) === shiftPeriodYear(latestPeriod, -1)) ?? null;
  const annuals = statements.filter((letter) => periodMonthsFromTitle(letter.title) === 12);
  const picked: ChosenStatement[] = [];
  const add = (letter: CodalLetter | null, role: FisStatementRole) => {
    if (!letter || picked.some((item) => item.letter.tracingNo === letter.tracingNo)) return;
    picked.push({ letter, role });
  };
  add(latest, "latest");
  add(priorInterim, "prior-interim");
  add(sameLastYear, "same-period-last-year");
  add(annuals[0] ?? null, "annual");
  add(annuals[1] ?? null, "prior-annual");
  return picked.slice(0, 5);
}

export function isDividendLetter(letter: Pick<CodalLetter, "letterCode" | "title">): boolean {
  if (letter.title.includes("شرکت")) return false;
  const code = foldLabel(letter.letterCode);
  if (code === "ن52" || code === "ن51" || code === "ن13") return true;
  const title = foldLabel(letter.title);
  return title.includes("زمانبندیپرداختسود")
    || title.includes("تصمیماتمجمععمومیعاديسالیانه")
    || title.includes("خلاصهتصمیماتمجمععمومیعاديسالیانه");
}

export function selectDividendLetters(letters: CodalLetter[], limit = 2): CodalLetter[] {
  const picked: CodalLetter[] = [];
  const years = new Set<string>();
  const sorted = letters.filter(isDividendLetter).sort((left, right) => right.tracingNo - left.tracingNo);
  for (const letter of sorted) {
    const period = periodFromTitle(letter.title);
    const year = period?.slice(0, 4) ?? `tracing:${letter.tracingNo}`;
    if (years.has(year)) continue;
    years.add(year);
    picked.push(letter);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function preferMonthlyDownloads(letters: CodalLetter[], havePeriods: string[], limit: number): CodalLetter[] {
  const have = new Set(havePeriods);
  const selected = selectMonthlyLetters(letters, 18).filter((letter) => {
    const period = periodFromTitle(letter.title);
    return period != null && !have.has(period);
  });
  const newestPeriod = periodFromTitle(selectMonthlyLetters(letters, 1)[0]?.title ?? "");
  const yearAgo = newestPeriod ? shiftPeriodYear(newestPeriod, -1) : null;
  const rank = (letter: CodalLetter) => {
    const period = periodFromTitle(letter.title);
    if (period != null && period === newestPeriod) return 0;
    if (period != null && period === yearAgo) return 1;
    return 2;
  };
  return selected
    .sort((left, right) => rank(left) - rank(right) || (periodFromTitle(right.title) ?? "").localeCompare(periodFromTitle(left.title) ?? ""))
    .slice(0, limit);
}

export function parseDividendPerShare(html: string): number | null {
  const rows = statementTables(html).flat();
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      const label = foldLabel(row[index] ?? "");
      if (!label.includes("سودنقدیهرسهم") && !label.includes("سودهرسهمنقدی")) continue;
      const inline = firstNumberInText(row[index] ?? "");
      if (inline != null && inline > 0) return inline;
      const next = parseCodalNumber(row[index + 1] ?? "");
      if (next != null && next > 0) return next;
    }
  }
  return null;
}

function firstNumberInText(value: string): number | null {
  const match = /[۰-۹0-9][۰-۹0-9,،.]*/.exec(value);
  if (!match) return null;
  return parseCodalNumber(match[0]);
}

export function parseCodalSearchXml(xml: string): CodalLetter[] {
  const blocks = [...xml.matchAll(/<CodalLetterHeaderDto\b[^>]*>([\s\S]*?)<\/CodalLetterHeaderDto>/gi)];
  if (blocks.length === 0 && !/<Letters\b/i.test(xml)) {
    throw new CodalShapeError(LIST_SHAPE);
  }
  return blocks.map((block, index) => {
    const body = block[1] ?? "";
    const tracingNo = Number(xmlTag(body, "TracingNo"));
    const symbol = decodeXml(xmlTag(body, "Symbol"));
    const title = decodeXml(xmlTag(body, "Title"));
    if (!Number.isInteger(tracingNo) || tracingNo <= 0 || !symbol || !title) {
      throw new CodalShapeError(`${LETTER_SHAPE} (${index + 1})`);
    }
    const excelUrl = decodeXml(xmlTag(body, "ExcelUrl"));
    const htmlPath = decodeXml(xmlTag(body, "Url"));
    return {
      tracingNo,
      symbol,
      title,
      letterCode: decodeXml(xmlTag(body, "LetterCode")),
      publishedLabel: decodeXml(xmlTag(body, "PublishDateTime")),
      excelUrl: excelUrl || null,
      htmlPath: htmlPath || null,
    };
  });
}

function xmlTag(body: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(body);
  return match?.[1]?.trim() ?? "";
}

function decodeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, digits: string) => codePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => codePoint(Number.parseInt(digits, 16)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .trim();
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
    const cells = [...match[0].matchAll(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi)].map((cell) => decodeCell(cell[0]));
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function decodeCell(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, digits: string) => codePoint(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, digits: string) => codePoint(Number.parseInt(digits, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&zwnj;/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function codePoint(code: number): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}

type LabelHit = { row: string[]; index: number; label: string };

function rowLabels(row: string[]): LabelHit[] {
  const hits: LabelHit[] = [];
  for (let index = 0; index < row.length; index += 1) {
    const label = foldLabel(row[index] ?? "");
    if (!label || /^\d+$/.test(label)) continue;
    hits.push({ row, index, label });
  }
  return hits;
}

function isSalesLabel(label: string): boolean {
  if (label.includes("بهای") || label.includes("هزینه") || label.includes("سایر") || label.includes("غیر") || label.includes("ناخالص")) return false;
  return label === "درآمدهایعملیاتی"
    || label === "درآمدعملیاتی"
    || label === "جمعدرآمدهایعملیاتی"
    || label === "جمعدرآمدها"
    || label === "فروشخالص"
    || label === "فروش"
    || (label.startsWith("درآمدهایعملیاتی") && !label.includes("تمام"));
}

function isNetLabel(label: string): boolean {
  if (label.includes("هرسهم") || label.includes("انباشته") || label.includes("ناخالص") || label.includes("تداوم") || label.includes("متوقف") || label.includes("فاقد") || label.includes("اقلیت")) {
    return false;
  }
  return label === "سودزیانخالص" || label === "سودخالص" || label.startsWith("سودزیانخالص") || label.startsWith("سودخالص");
}

function isOperatingLabel(label: string): boolean {
  return label.includes("سود") && label.includes("عملیاتی") && !label.includes("خالص") && !label.includes("درآمد") && !label.includes("هزینه");
}

function isAssetLabel(label: string): boolean {
  return label === "جمعداراییها" || (label.startsWith("جمعداراییها") && !label.includes("بدهی"));
}

function isEquityLabel(label: string): boolean {
  return label === "جمعحقوقمالکانه" || label === "جمعحقوقصاحبانسهام";
}

function findHit(rows: string[][], accept: (label: string) => boolean, preferred: string[] = []): LabelHit | null {
  const hits = rows.flatMap(rowLabels).filter((hit) => accept(hit.label));
  for (const name of preferred) {
    const exact = hits.find((hit) => hit.label === name);
    if (exact) return exact;
  }
  return hits[0] ?? null;
}

function noteColumn(rows: string[][]): number | null {
  for (const row of rows.slice(0, 6)) {
    const index = row.findIndex((cell) => foldLabel(cell).includes("یادداشت"));
    if (index >= 0) return index;
  }
  return null;
}

function amountsAfter(row: string[], labelIndex: number, noteIndex: number | null): number[] {
  const amounts: number[] = [];
  for (let index = labelIndex + 1; index < row.length; index += 1) {
    if (index === noteIndex) continue;
    const value = parseCodalNumber(row[index] ?? "");
    if (value == null) continue;
    amounts.push(value);
  }
  return amounts;
}

function statementTables(html: string): string[][][] {
  const tables = htmlTables(html);
  return (tables.length > 0 ? tables : [html]).map(tableRows).filter((rows) => rows.length > 0);
}

function lastMatching(tables: string[][][], accept: (rows: string[][]) => boolean): string[][] | null {
  let found: string[][] | null = null;
  for (const rows of tables) {
    if (accept(rows)) found = rows;
  }
  return found;
}

function tableHas(rows: string[][], accept: (label: string) => boolean): boolean {
  return rows.some((row) => rowLabels(row).some((hit) => accept(hit.label)));
}

export function parseStatementHtml(html: string): StatementFigures {
  const tables = statementTables(html);
  const income = lastMatching(tables, (rows) => tableHas(rows, isNetLabel));
  if (!income) throw new CodalShapeError(STATEMENT_SHAPE);
  const balance = lastMatching(tables, (rows) => tableHas(rows, (label) => isAssetLabel(label) || isEquityLabel(label))) ?? income;
  const incomeNote = noteColumn(income);
  const balanceNote = noteColumn(balance);
  const salesHit = findHit(income, isSalesLabel, ["درآمدهایعملیاتی", "جمعدرآمدهایعملیاتی", "درآمدعملیاتی", "جمعدرآمدها", "فروشخالص", "فروش"]);
  const netHit = findHit(income, isNetLabel, ["سودزیانخالص", "سودخالص"]);
  const netIncome = netHit ? amountsAfter(netHit.row, netHit.index, incomeNote)[0] ?? null : null;
  if (netIncome == null) throw new CodalShapeError(STATEMENT_SHAPE);

  const amount = (hit: LabelHit | null, note: number | null, place: number) =>
    hit ? amountsAfter(hit.row, hit.index, note)[place] ?? null : null;
  const incomeHit = (accept: (label: string) => boolean, preferred: string[] = []) => findHit(income, accept, preferred);
  const balanceHit = (accept: (label: string) => boolean, preferred: string[] = []) => findHit(balance, accept, preferred);
  const inventory = balanceHit((label) => label.includes("موجودیموادوکالا") || label === "موجودیکالا");

  return {
    sales: amount(salesHit, incomeNote, 0),
    netIncome,
    equity: amount(balanceHit(isEquityLabel, ["جمعحقوقمالکانه", "جمعحقوقصاحبانسهام"]), balanceNote, 0),
    periodEps: amount(incomeHit((label) => label.includes("هرسهم") && (label.includes("خالص") || label.includes("پایه"))), incomeNote, 0),
    operatingProfit: amount(incomeHit(isOperatingLabel), incomeNote, 0),
    otherOperatingIncome: amount(incomeHit((label) => label.includes("سایردرآمد") && !label.includes("غیرعملیاتی") && !label.includes("هزینه")), incomeNote, 0),
    totalAssets: amount(balanceHit(isAssetLabel, ["جمعداراییها"]), balanceNote, 0),
    receivables: amount(balanceHit((label) => label.includes("دریافتنیهایتجاری") || label.includes("حسابهاواسناددریافتنی")), balanceNote, 0),
    inventory: amount(inventory, balanceNote, 0),
    priorInventory: amount(inventory, balanceNote, 1),
    cogs: amount(incomeHit((label) => label.includes("بهایتمامشده")), incomeNote, 0),
    retainedEarnings: amount(balanceHit((label) => label === "سودانباشته" || label.startsWith("سودزیانانباشته")), balanceNote, 0),
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
  return [...byPeriod.values()].sort((left, right) => left.period.localeCompare(right.period)).slice(-18);
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
