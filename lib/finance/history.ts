import {
  foldLabel,
  isFinancialStatement,
  periodFromTitle,
  periodMonthsFromTitle,
  type CodalLetter,
  type StatementFigures,
} from "@/lib/finance/codal/parse";
import { formatNumber } from "@/lib/finance/format";
import type { StatementKind } from "@/lib/finance/types";

export const MONTHLY_QUANTITY_GAP = "تعداد فروش، مقدار تولید و نرخ میانگین در گزارش ماهانه جدا نشده و خالی مانده است.";

const PERIOD_SHAPE = /^\d{4}\/\d{2}\/\d{2}$/;

export type PlannedPeriod = {
  period: string;
  months: number;
  kind: StatementKind;
  tracingNo: string;
  revisionOf: string | null;
  figures: StatementFigures;
  source: string;
};

export type PlannedMonth = {
  period: string;
  salesValue: number;
  salesQty: null;
  productionQty: null;
  avgRate: null;
  tracingNo: string;
  source: string;
};

export type RahavardPeriod = {
  period: string;
  months: number;
  figures: StatementFigures;
};

export function statementKind(months: number): StatementKind | null {
  if (!Number.isInteger(months) || months < 1 || months > 12) return null;
  return months >= 12 ? "annual" : "interim";
}

export function isStatementRevision(letter: Pick<CodalLetter, "letterCode" | "title">): boolean {
  return isFinancialStatement(letter) && foldLabel(letter.title).includes("اصلاحیه");
}

export function dedupeLetters(letters: CodalLetter[]): CodalLetter[] {
  const seen = new Set<number>();
  const unique: CodalLetter[] = [];
  for (const letter of letters) {
    if (seen.has(letter.tracingNo)) continue;
    seen.add(letter.tracingNo);
    unique.push(letter);
  }
  return unique;
}

export function revisionOfTracing(
  letter: CodalLetter,
  letters: CodalLetter[],
): { revisionOf: string | null; gap: string | null } {
  if (!isStatementRevision(letter)) return { revisionOf: null, gap: null };
  const period = periodFromTitle(letter.title);
  if (!period) return { revisionOf: null, gap: null };
  const originals = dedupeLetters(letters).filter((item) =>
    item.tracingNo !== letter.tracingNo
    && isFinancialStatement(item)
    && !isStatementRevision(item)
    && periodFromTitle(item.title) === period,
  );
  const original = originals[0];
  if (originals.length !== 1 || !original) {
    return { revisionOf: null, gap: `شمارهٔ پیگیری اصل برای دورهٔ ${period} پیدا نشد.` };
  }
  return { revisionOf: String(original.tracingNo), gap: null };
}

export function chooseStatementLetters(letters: CodalLetter[], quarters: number): CodalLetter[] {
  const ready = dedupeLetters(letters).filter((letter) => {
    if (!isFinancialStatement(letter)) return false;
    return periodFromTitle(letter.title) != null && periodMonthsFromTitle(letter.title) != null;
  });
  const periods = [...new Set(ready.map((letter) => periodFromTitle(letter.title) as string))]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, Math.max(0, quarters));
  const wanted = new Set(periods);
  return ready.filter((letter) => wanted.has(periodFromTitle(letter.title) as string));
}

export function periodFromStatement(input: {
  letter: CodalLetter;
  letters: CodalLetter[];
  figures: StatementFigures;
  source: string;
}): { row: PlannedPeriod | null; gaps: string[] } {
  const gaps: string[] = [];
  const source = input.source.trim();
  const period = periodFromTitle(input.letter.title);
  const months = periodMonthsFromTitle(input.letter.title);
  if (!period || !PERIOD_SHAPE.test(period)) {
    gaps.push(`دورهٔ شمسی نامهٔ ${input.letter.tracingNo} خوانده نشد.`);
    return { row: null, gaps };
  }
  if (months == null) {
    gaps.push(`طول دورهٔ ${period} خوانده نشد.`);
    return { row: null, gaps };
  }
  const kind = statementKind(months);
  if (!kind) {
    gaps.push(`طول دورهٔ ${period} خارج از ۱ تا ۱۲ ماه است.`);
    return { row: null, gaps };
  }
  if (!source) {
    gaps.push(`منبع صورت دورهٔ ${period} خالی است.`);
    return { row: null, gaps };
  }
  const revision = revisionOfTracing(input.letter, input.letters);
  if (revision.gap) gaps.push(revision.gap);
  return {
    row: {
      period,
      months,
      kind,
      tracingNo: String(input.letter.tracingNo),
      revisionOf: revision.revisionOf,
      figures: input.figures,
      source: source.slice(0, 80),
    },
    gaps,
  };
}

export function monthFromPoint(input: {
  period: string;
  sales: number;
  tracingNo: string;
  source: string;
}): PlannedMonth | null {
  const source = input.source.trim();
  const tracingNo = input.tracingNo.trim();
  if (!PERIOD_SHAPE.test(input.period) || !Number.isFinite(input.sales) || !source || !tracingNo) return null;
  return {
    period: input.period,
    salesValue: input.sales,
    salesQty: null,
    productionQty: null,
    avgRate: null,
    tracingNo,
    source: source.slice(0, 80),
  };
}

export function addRahavardPeriods(input: {
  stored: PlannedPeriod[];
  codalPeriods: string[];
  rahavard: RahavardPeriod[];
  quarters: number;
}): { added: PlannedPeriod[]; gaps: string[] } {
  const storedPeriods = new Set(input.stored.map((row) => row.period));
  const seenByCodal = new Set(input.codalPeriods);
  const gaps: string[] = [];
  for (const period of seenByCodal) {
    if (!storedPeriods.has(period)) gaps.push(`صورت دورهٔ ${period} از کدال خوانده نشد.`);
  }
  const added: PlannedPeriod[] = [];
  if (storedPeriods.size >= input.quarters) return { added, gaps };
  const candidates = [...input.rahavard].sort((left, right) => right.period.localeCompare(left.period));
  for (const row of candidates) {
    if (storedPeriods.size >= input.quarters) break;
    if (seenByCodal.has(row.period) || storedPeriods.has(row.period)) continue;
    const kind = statementKind(row.months);
    if (!kind || !PERIOD_SHAPE.test(row.period)) continue;
    storedPeriods.add(row.period);
    added.push({
      period: row.period,
      months: row.months,
      kind,
      tracingNo: `rahavard:${row.period}`,
      revisionOf: null,
      figures: row.figures,
      source: "rahavard",
    });
  }
  const have = new Set([...input.stored.map((row) => row.period), ...added.map((row) => row.period)]).size;
  if (have < input.quarters) {
    gaps.push(`از ${formatNumber(input.quarters)} فصل درخواستی، ${formatNumber(have)} فصل پیدا شد.`);
  }
  return { added, gaps };
}

export function monthlyShortfall(stored: number, requested: number): string | null {
  if (stored >= requested) return null;
  return `گزارش ماهانهٔ کدال برای ${formatNumber(requested)} ماه کامل نبود؛ ${formatNumber(stored)} ماه ذخیره شد.`;
}

export function distinctPeriods(rows: PlannedPeriod[]): number {
  return new Set(rows.map((row) => row.period)).size;
}

export function resolvePreviousScore(stored: number | null | undefined, reported: number | null | undefined): number | null {
  if (stored !== undefined) return stored;
  return reported ?? null;
}

export function latestScoreBySymbol(
  rows: { symbol: string; asOf: string; score: number | null }[],
): Map<string, number | null> {
  const ordered = [...rows].sort((left, right) => right.asOf.localeCompare(left.asOf) || right.symbol.localeCompare(left.symbol));
  const scores = new Map<string, number | null>();
  for (const row of ordered) {
    if (!row.symbol || scores.has(row.symbol)) continue;
    scores.set(row.symbol, row.score);
  }
  return scores;
}
