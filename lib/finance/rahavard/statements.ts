import { foldLabel, type StatementFigures } from "@/lib/finance/codal/parse";
import { salesGrowth } from "@/lib/finance/fis";
import { isoToJalali, jalaliMonthLength } from "@/lib/finance/jalali";
import { fetchRahavardJson, matchRahavard, parseRahavardSearch } from "@/lib/finance/prices/rahavard";
import { MarketShapeError } from "@/lib/finance/prices/shape-error";

const MILLION = 1_000_000;
const PAR_RIAL = 1_000;
const READ_TIMEOUT = 12_000;

export class RahavardShapeError extends Error {
  constructor() {
    super("ساختار صورت رهاورد عوض شده.");
    this.name = "RahavardShapeError";
  }
}

export type RahavardFundamentals = {
  current: { figures: StatementFigures; months: number; period: string } | null;
  prior: { figures: StatementFigures; months: number; period: string } | null;
  statementSalesGrowth: number | null;
  dividendRatio: number | null;
  olderPeriods: { period: string; months: number }[];
  ttmEps: number | null;
  error: string | null;
};

type Line = { title: string; english: string; value: number };

type SheetRow = {
  announced: string;
  fiscalYear: string;
  months: number;
  audited: boolean;
  capital: number | null;
  lines: Line[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/[,،]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function blank(error: string | null): RahavardFundamentals {
  return {
    current: null,
    prior: null,
    statementSalesGrowth: null,
    dividendRatio: null,
    olderPeriods: [],
    ttmEps: null,
    error,
  };
}

export function statementPeriod(fiscalYear: string, months: number): string | null {
  const end = isoToJalali(fiscalYear.slice(0, 10));
  if (!end || months <= 0) return null;
  const span = months >= 12 ? 0 : 12 - months;
  let month = end.jm - span;
  let year = end.jy;
  while (month <= 0) {
    month += 12;
    year -= 1;
  }
  const monthEnd = end.jd === jalaliMonthLength(end.jy, end.jm);
  const day = monthEnd ? jalaliMonthLength(year, month) : Math.min(end.jd, jalaliMonthLength(year, month));
  return `${year}/${pad(month)}/${pad(day)}`;
}

function rowsFrom(payload: unknown): SheetRow[] {
  const data = asRecord(payload)?.data;
  if (!Array.isArray(data)) throw new RahavardShapeError();
  const rows: SheetRow[] = [];
  for (const item of data) {
    const row = asRecord(item);
    const announced = typeof row?.date === "string" ? row.date.slice(0, 10) : "";
    const fiscalYear = typeof row?.fiscal_year === "string" ? row.fiscal_year.slice(0, 10) : "";
    const period = numeric(row?.fiscal_period);
    const months = period === 0 ? 12 : period;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(announced) || !/^\d{4}-\d{2}-\d{2}$/.test(fiscalYear)) continue;
    if (months !== 3 && months !== 6 && months !== 9 && months !== 12) continue;
    const lines: Line[] = [];
    if (Array.isArray(row?.items)) {
      for (const entry of row.items) {
        const record = asRecord(entry);
        const field = asRecord(record?.field);
        const value = numeric(record?.value);
        const title = typeof field?.title === "string" ? field.title : "";
        if (!title || value == null) continue;
        lines.push({
          title,
          english: typeof field?.english_title === "string" ? field.english_title : "",
          value,
        });
      }
    }
    rows.push({
      announced,
      fiscalYear,
      months,
      audited: row?.is_audited === true,
      capital: numeric(row?.capital),
      lines,
    });
  }
  return rows;
}

function lineKey(line: Line): string {
  return folded(line) || line.english;
}

function dedupe(rows: SheetRow[]): SheetRow[] {
  const groups = new Map<string, SheetRow[]>();
  for (const row of rows) {
    const key = `${row.fiscalYear}|${row.months}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((group) => {
    const ordered = [...group].sort((a, b) => a.announced.localeCompare(b.announced) || Number(a.audited) - Number(b.audited));
    const lines = new Map<string, Line>();
    let capital: number | null = null;
    for (const row of ordered) {
      if (row.capital != null) capital = row.capital;
      for (const line of row.lines) lines.set(lineKey(line), line);
    }
    const newest = ordered[ordered.length - 1];
    return { ...(newest ?? group[0]), capital, lines: [...lines.values()] } as SheetRow;
  });
}

function folded(line: Line): string {
  return foldLabel(line.title);
}

function findLine(row: SheetRow | null, match: (line: Line) => boolean): number | null {
  return row?.lines.find(match)?.value ?? null;
}

function isSales(line: Line): boolean {
  return line.english === "Sales Revenue" || folded(line) === "درآمدحاصلازخدماتوفروش";
}

function isNet(line: Line): boolean {
  return line.english.startsWith("Net Earnings") || folded(line) === "سودزیانخالص" || folded(line).includes("سودزیانویژه");
}

function isOperating(line: Line): boolean {
  return line.english === "Operating Income" || folded(line) === "سودزیانعملیاتی";
}

function isOtherOperating(line: Line): boolean {
  const label = folded(line);
  return line.english.startsWith("Realized Operational Gains")
    || (label.includes("سایردرآمد") && label.includes("عملیاتی") && !label.includes("غیرعملیاتی"))
    || label.includes("خالصدرآمدهاوهزینههایعملیاتی");
}

function isCogs(line: Line): boolean {
  return line.english.startsWith("Cost of Goods Sold") || folded(line).includes("بهایتمامشده");
}

function isReceivable(line: Line): boolean {
  const label = folded(line);
  return (line.english.includes("Receivable") && !line.english.includes("Payable"))
    || ((label.includes("دریافتنی") || label.includes("دریافتی")) && !label.includes("پرداختنی"));
}

function isInventory(line: Line): boolean {
  return line.english === "Inventory" || folded(line) === "موجودیموادوکالا";
}

function isAssets(line: Line): boolean {
  return line.english === "Total Assets" || folded(line) === "جمعکلداراییها";
}

function isRetained(line: Line): boolean {
  return line.english === "Retained Earnings" || folded(line) === "سودزیانانباشته";
}

function isEquity(line: Line): boolean {
  return line.english === "Total Equity" || folded(line) === "جمعحقوقصاحبانسهام";
}

function isCurrentDividend(line: Line): boolean {
  const label = folded(line);
  return label.includes("سودسهاممصوب") && label.includes("سالجاری") && !label.includes("سالقبل");
}

function million(value: number | null): number | null {
  return value == null ? null : value / MILLION;
}

function periodEps(netRials: number | null, capital: number | null): number | null {
  if (netRials == null || capital == null || !(capital > 0)) return null;
  const eps = (netRials * PAR_RIAL) / capital;
  return Number.isFinite(eps) ? eps : null;
}

function fyStamp(iso: string): { year: number; monthDay: string } | null {
  const date = isoToJalali(iso);
  if (!date) return null;
  return { year: date.jy, monthDay: `${pad(date.jm)}/${pad(date.jd)}` };
}

function figuresFor(
  income: SheetRow,
  balance: SheetRow | null,
  priorInventory: number | null,
  priorSales: number | null,
): StatementFigures | null {
  const sales = findLine(income, isSales);
  const net = findLine(income, isNet);
  if (sales == null || net == null) return null;
  const netMillion = million(net);
  if (netMillion == null) return null;
  return {
    sales: million(sales),
    netIncome: netMillion,
    equity: million(findLine(balance, isEquity)),
    periodEps: periodEps(net, income.capital),
    operatingProfit: million(findLine(income, isOperating)),
    otherOperatingIncome: million(findLine(income, isOtherOperating)),
    totalAssets: million(findLine(balance, isAssets)),
    receivables: million(findLine(balance, isReceivable)),
    inventory: million(findLine(balance, isInventory)),
    priorInventory: million(priorInventory),
    cogs: million(findLine(income, isCogs)),
    retainedEarnings: million(findLine(balance, isRetained)),
    priorPeriodSales: million(priorSales),
  };
}

function withFigures(row: SheetRow, balance: SheetRow[], priorInventory: number | null, priorSales: number | null) {
  const period = statementPeriod(row.fiscalYear, row.months);
  const figures = figuresFor(row, balance.find((item) => item.fiscalYear === row.fiscalYear && item.months === row.months) ?? null, priorInventory, priorSales);
  if (!period || !figures) return null;
  return { figures, months: row.months, period };
}

function ttmEps(asset: unknown): number | null {
  const value = numeric(asRecord(asRecord(asRecord(asset)?.data)?.eps)?.pure_ttm);
  return value != null && value > 0 ? value : null;
}

function dividendRatio(rows: SheetRow[], balance: SheetRow[]): number | null {
  const years = [...new Set(rows.filter((row) => row.months === 12).map((row) => row.fiscalYear))].sort((a, b) => b.localeCompare(a));
  const ratios: number[] = [];
  for (const year of years) {
    const row = rows
      .filter((item) => item.fiscalYear === year && item.months === 12 && findLine(item, isCurrentDividend) != null)
      .sort((a, b) => b.announced.localeCompare(a.announced))[0];
    const dividend = findLine(row ?? null, isCurrentDividend);
    const retained = findLine(balance.find((item) => item.fiscalYear === year && item.months === 12) ?? null, isRetained);
    if (dividend == null || retained == null || !(Math.abs(dividend) > 0) || !(retained > 0)) continue;
    ratios.push((Math.abs(dividend) / retained) * 100);
    if (ratios.length === 2) break;
  }
  return ratios.length === 2 ? ((ratios[0] ?? 0) + (ratios[1] ?? 0)) / 2 : null;
}

export function parseRahavardFundamentals(input: {
  interim: unknown;
  annual: unknown;
  balance: unknown;
  asset: unknown;
}): RahavardFundamentals {
  const incomeRows = [...rowsFrom(input.interim), ...rowsFrom(input.annual)];
  const income = dedupe(incomeRows);
  const balance = dedupe(rowsFrom(input.balance));
  const usable = income
    .filter((row) => findLine(row, isSales) != null && findLine(row, isNet) != null)
    .sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear) || b.months - a.months || b.announced.localeCompare(a.announced));
  const current = usable[0] ?? null;
  if (!current) return { ...blank("صورت سود و زیان رهاورد برای این نماد پیدا نشد."), ttmEps: ttmEps(input.asset) };
  const prior = usable.find((row) => row.fiscalYear === current.fiscalYear && row.months < current.months) ?? null;
  const currentFy = fyStamp(current.fiscalYear);
  const yoy = currentFy
    ? usable.find((row) => {
      const stamp = fyStamp(row.fiscalYear);
      return stamp != null && stamp.year === currentFy.year - 1 && stamp.monthDay === currentFy.monthDay && row.months === current.months;
    }) ?? null
    : null;
  const opening = currentFy
    ? balance.find((row) => {
      const stamp = fyStamp(row.fiscalYear);
      return row.months === 12 && stamp != null && stamp.year === currentFy.year - 1 && stamp.monthDay === currentFy.monthDay;
    }) ?? null
    : null;
  const openingInventory = findLine(opening, isInventory);
  const currentFigures = withFigures(current, balance, openingInventory, findLine(yoy, isSales));
  const priorFigures = prior ? withFigures(prior, balance, null, null) : null;
  const annuals = income
    .filter((row) => row.months === 12)
    .sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear));
  const endings = annuals.flatMap((row) => {
    const period = statementPeriod(row.fiscalYear, 12);
    return period ? [{ period, months: 12 }] : [];
  }).slice(0, 2);
  return {
    current: currentFigures,
    prior: priorFigures,
    statementSalesGrowth: salesGrowth(currentFigures?.figures.sales ?? null, million(findLine(yoy, isSales))),
    dividendRatio: dividendRatio(income, balance),
    olderPeriods: endings,
    ttmEps: ttmEps(input.asset),
    error: currentFigures ? null : "صورت سود و زیان رهاورد برای این نماد پیدا نشد.",
  };
}

async function readSheet(path: string): Promise<unknown> {
  const filtered = await fetchRahavardJson(`${path}&financial_view_type_id=1`, READ_TIMEOUT);
  const data = asRecord(filtered)?.data;
  if (Array.isArray(data) && data.length > 0) return filtered;
  return fetchRahavardJson(path, READ_TIMEOUT);
}

export async function fetchRahavardFundamentals(symbol: string): Promise<RahavardFundamentals> {
  try {
    const found = matchRahavard(
      parseRahavardSearch(await fetchRahavardJson(`/api/v2/search?keyword=${encodeURIComponent(symbol)}`)),
      symbol,
    );
    if (!found) return blank("نماد در رهاورد پیدا نشد.");
    const id = found.id;
    const [interim, annual, interimBalance, annualBalance, asset] = await Promise.all([
      readSheet(`/api/v2/asset/${id}/profitloss?_skip=0&_count=20&announcement_type_id=3`),
      readSheet(`/api/v2/asset/${id}/profitloss?_skip=0&_count=6&announcement_type_id=1`),
      readSheet(`/api/v2/asset/${id}/balancesheets?_skip=0&_count=16&announcement_type_id=3`),
      readSheet(`/api/v2/asset/${id}/balancesheets?_skip=0&_count=6&announcement_type_id=1`),
      fetchRahavardJson(`/api/v2/asset/${id}`, READ_TIMEOUT).catch(() => null),
    ]);
    const balance = asRecord(interimBalance);
    const annualRows = asRecord(annualBalance);
    const merged = {
      data: [...(Array.isArray(balance?.data) ? balance.data : []), ...(Array.isArray(annualRows?.data) ? annualRows.data : [])],
    };
    return parseRahavardFundamentals({ interim, annual, balance: merged, asset });
  } catch (error) {
    if (error instanceof RahavardShapeError || error instanceof MarketShapeError) return blank("ساختار صورت رهاورد عوض شده.");
    return blank("رهاورد خوانده نشد.");
  }
}
