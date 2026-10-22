import { jalaliMonthLength } from "@/lib/finance/jalali";

const PERIOD = /^(\d{4})\/(\d{2})\/(\d{2})$/;
const QUARTER_MONTHS = new Set([3, 6, 9, 12]);

export type TrendPeriod = {
  period: string;
  months: number;
  tracingNo: string;
  revisionOf: string | null;
  sales: number | null;
  netIncome: number | null;
  operatingProfit: number | null;
  otherOperatingIncome: number | null;
  periodEps: number | null;
};

export type CumulativeStatement = TrendPeriod & {
  fiscalYearEnd: string;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function monthLength(year: number, month: number): number | null {
  if (month < 1 || month > 12) return null;
  try {
    return jalaliMonthLength(year, month);
  } catch {
    return null;
  }
}

/** Fiscal year end is the last day of the month, months after this statement. */
export function fiscalYearEnd(period: string, months: number): string | null {
  const match = PERIOD.exec(period);
  if (!match || !Number.isInteger(months) || months < 1 || months > 12) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const length = monthLength(year, month);
  if (length == null || day < 1 || day > length) return null;
  const index = year * 12 + (month - 1) + (12 - months);
  const endYear = Math.floor(index / 12);
  const endMonth = (index % 12) + 1;
  const endDay = monthLength(endYear, endMonth);
  if (endDay == null) return null;
  return `${endYear}/${pad(endMonth)}/${pad(endDay)}`;
}

export function shiftFiscalYear(fiscalYearEnd: string, years: number): string | null {
  const match = PERIOD.exec(fiscalYearEnd);
  if (!match || !Number.isInteger(years)) return null;
  const year = Number(match[1]) + years;
  const month = Number(match[2]);
  const day = monthLength(year, month);
  if (day == null) return null;
  return `${year}/${pad(month)}/${pad(day)}`;
}

function sameFlows(left: TrendPeriod, right: TrendPeriod): boolean {
  return left.sales === right.sales
    && left.netIncome === right.netIncome
    && left.operatingProfit === right.operatingProfit
    && left.otherOperatingIncome === right.otherOperatingIncome
    && left.periodEps === right.periodEps;
}

function pickRevision(group: TrendPeriod[]): { row: TrendPeriod | null; gap: string | null } {
  const period = group[0]?.period ?? "";
  const byTracing = new Map<string, TrendPeriod>();
  for (const row of group) {
    const existing = byTracing.get(row.tracingNo);
    if (existing && !sameFlows(existing, row)) {
      return { row: null, gap: `شمارهٔ پیگیری ${row.tracingNo} برای دورهٔ ${period} دو رقم متفاوت دارد.` };
    }
    byTracing.set(row.tracingNo, row);
  }
  const unique = [...byTracing.values()];
  const superseded = new Set<string>();
  for (const row of unique) {
    if (row.revisionOf && byTracing.has(row.revisionOf)) superseded.add(row.revisionOf);
  }
  const remaining = unique.filter((row) => !superseded.has(row.tracingNo));
  if (remaining.length === 1) return { row: remaining[0] ?? null, gap: null };
  if (remaining.length === 0) return { row: null, gap: `زنجیرهٔ اصلاحیهٔ دورهٔ ${period} بسته نشد.` };
  return { row: null, gap: `برای دورهٔ ${period} چند اصلاحیه بدون ترتیب مشخص مانده است.` };
}

export function resolveCumulatives(periods: TrendPeriod[]): { rows: CumulativeStatement[]; gaps: string[] } {
  const gaps: string[] = [];
  const groups = new Map<string, TrendPeriod[]>();
  for (const period of periods) {
    if (!QUARTER_MONTHS.has(period.months)) {
      gaps.push(`طول دورهٔ ${period.period} برای فصل‌بندی ۳، ۶، ۹ یا ۱۲ ماه نیست.`);
      continue;
    }
    if (!fiscalYearEnd(period.period, period.months)) {
      gaps.push(`تاریخ دورهٔ ${period.period} خوانده نشد.`);
      continue;
    }
    const key = `${period.period}|${period.months}`;
    const list = groups.get(key) ?? [];
    list.push(period);
    groups.set(key, list);
  }
  const rows: CumulativeStatement[] = [];
  for (const group of groups.values()) {
    const picked = pickRevision(group);
    if (picked.gap) gaps.push(picked.gap);
    if (!picked.row) continue;
    const end = fiscalYearEnd(picked.row.period, picked.row.months);
    if (!end) continue;
    rows.push({ ...picked.row, fiscalYearEnd: end });
  }
  return { rows, gaps };
}

export function findCumulative(
  rows: CumulativeStatement[],
  fiscalYear: string,
  months: number,
): { row: CumulativeStatement | null; gap: string | null } {
  const found = rows.filter((row) => row.fiscalYearEnd === fiscalYear && row.months === months);
  if (found.length === 1) return { row: found[0] ?? null, gap: null };
  if (found.length === 0) return { row: null, gap: null };
  return { row: null, gap: `برای سال مالی ${fiscalYear} بیش از یک صورت ${months} ماهه مانده است.` };
}

export function latestCumulative(rows: CumulativeStatement[]): { row: CumulativeStatement | null; gap: string | null } {
  if (rows.length === 0) return { row: null, gap: "صورت تجمعی برای روند موجود نیست." };
  const sorted = [...rows].sort((left, right) => right.period.localeCompare(left.period) || right.months - left.months);
  const top = sorted[0];
  if (!top) return { row: null, gap: "صورت تجمعی برای روند موجود نیست." };
  const ties = sorted.filter((row) => row.period === top.period);
  if (ties.length > 1) return { row: null, gap: `چند صورت برای دورهٔ ${top.period} مانده است.` };
  return { row: top, gap: null };
}
