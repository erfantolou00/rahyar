import {
  fetchCodalMonthlyLetters,
  fetchCodalReport,
  fetchCodalStatementLetters,
} from "@/lib/finance/codal/fetch";
import { mapPool } from "@/lib/finance/codal/sync";
import {
  CodalShapeError,
  parseMonthlySalesHtml,
  parseStatementHtml,
  periodFromTitle,
  selectMonthlyLetters,
  type CodalLetter,
  type StatementFigures,
} from "@/lib/finance/codal/parse";
import {
  MONTHLY_QUANTITY_GAP,
  addRahavardPeriods,
  chooseStatementLetters,
  distinctPeriods,
  monthFromPoint,
  monthlyShortfall,
  periodFromStatement,
  type PlannedMonth,
  type PlannedPeriod,
  type RahavardPeriod,
} from "@/lib/finance/history";
import { saveFundamentalHistory } from "@/lib/finance/history-store";
import type { FinanceClient } from "@/lib/finance/queries";
import { fetchRahavardHistory } from "@/lib/finance/rahavard/statements";

export type BackfillOptions = {
  quarters?: number;
  months?: number;
};

export type BackfillResult = {
  symbol: string;
  ok: boolean;
  periods: number;
  months: number;
  gaps: string[];
};

export type HistorySources = {
  statementLetters: (symbol: string, quarters: number) => Promise<{ letters: CodalLetter[]; reached: boolean }>;
  monthlyLetters: (symbol: string, months: number) => Promise<{ letters: CodalLetter[]; reached: boolean }>;
  readReport: (letter: CodalLetter) => Promise<{ html: string; source: string } | null>;
  rahavardStatements: (symbol: string) => Promise<RahavardPeriod[]>;
};

const defaultSources: HistorySources = {
  statementLetters: fetchCodalStatementLetters,
  monthlyLetters: fetchCodalMonthlyLetters,
  readReport: fetchCodalReport,
  rahavardStatements: fetchRahavardHistory,
};

function letterPeriod(letter: CodalLetter): string | null {
  return periodFromTitle(letter.title);
}

export async function backfillSymbolHistory(
  supabase: FinanceClient,
  userId: string,
  symbol: string,
  options: BackfillOptions = {},
  sources: HistorySources = defaultSources,
): Promise<BackfillResult> {
  const quarters = options.quarters ?? 6;
  const monthsWanted = options.months ?? 12;
  const gaps: string[] = [];
  const statementSearch = await sources.statementLetters(symbol, quarters);
  if (!statementSearch.reached) gaps.push("فهرست صورت‌های کدال خوانده نشد.");
  const chosen = chooseStatementLetters(statementSearch.letters, quarters);
  const codalPeriods = [...new Set(chosen.map(letterPeriod).filter((period): period is string => period != null))];
  const parsed: { letter: CodalLetter; figures: StatementFigures; source: string }[] = [];

  await mapPool(chosen, 2, async (letter) => {
    const period = letterPeriod(letter) ?? String(letter.tracingNo);
    let report: { html: string; source: string } | null = null;
    try {
      report = await sources.readReport(letter);
    } catch (error) {
      const message = error instanceof Error ? error.message : "صورت مالی کدال خوانده نشد.";
      gaps.push(`نامهٔ ${letter.tracingNo} برای دورهٔ ${period} خوانده نشد. ${message}`);
      return;
    }
    if (!report) {
      gaps.push(`فایل صورت ${period} دریافت نشد.`);
      return;
    }
    try {
      parsed.push({ letter, figures: parseStatementHtml(report.html), source: report.source });
    } catch (error) {
      const message = error instanceof CodalShapeError ? error.message : "صورت مالی کدال خوانده نشد.";
      gaps.push(`نامهٔ ${letter.tracingNo} برای دورهٔ ${period} خوانده نشد. ${message}`);
    }
  });

  const periods: PlannedPeriod[] = [];
  for (const item of parsed) {
    const built = periodFromStatement({
      letter: item.letter,
      letters: chosen,
      figures: item.figures,
      source: item.source,
    });
    gaps.push(...built.gaps);
    if (built.row) periods.push(built.row);
  }

  const rahavard = codalPeriods.length < quarters ? await sources.rahavardStatements(symbol) : [];
  const filled = addRahavardPeriods({ stored: periods, codalPeriods, rahavard, quarters });
  gaps.push(...filled.gaps);
  periods.push(...filled.added);

  const monthlySearch = await sources.monthlyLetters(symbol, monthsWanted);
  if (!monthlySearch.reached) gaps.push("فهرست گزارش ماهانهٔ کدال خوانده نشد.");
  const monthlyLetters = selectMonthlyLetters(monthlySearch.letters, monthsWanted);
  const monthRows: PlannedMonth[] = [];
  await mapPool(monthlyLetters, 2, async (letter) => {
    const period = letterPeriod(letter) ?? String(letter.tracingNo);
    let report: { html: string; source: string } | null = null;
    try {
      report = await sources.readReport(letter);
    } catch (error) {
      const message = error instanceof Error ? error.message : "گزارش ماهانه کدال خوانده نشد.";
      gaps.push(`گزارش ماهانهٔ ${period} خوانده نشد. ${message}`);
      return;
    }
    if (!report) {
      gaps.push(`فایل گزارش ماهانهٔ ${period} دریافت نشد.`);
      return;
    }
    try {
      const point = parseMonthlySalesHtml(report.html, letter.title);
      const row = monthFromPoint({
        period: point.period,
        sales: point.sales,
        tracingNo: String(letter.tracingNo),
        source: report.source,
      });
      if (!row) {
        gaps.push(`دورهٔ گزارش ماهانهٔ ${letter.tracingNo} خوانده نشد.`);
        return;
      }
      monthRows.push(row);
    } catch (error) {
      const message = error instanceof CodalShapeError ? error.message : "گزارش ماهانه کدال خوانده نشد.";
      gaps.push(`گزارش ماهانهٔ ${period} خوانده نشد. ${message}`);
    }
  });
  if (monthRows.length > 0) gaps.push(MONTHLY_QUANTITY_GAP);
  const shortfall = monthlyShortfall(new Set(monthRows.map((row) => row.period)).size, monthsWanted);
  if (shortfall) gaps.push(shortfall);

  const saved = await saveFundamentalHistory(supabase, userId, symbol, periods, monthRows);
  if (!saved.ok) {
    gaps.push(saved.missingSchema ? "جدول تاریخچه در پایگاه نیست." : "ذخیرهٔ تاریخچه انجام نشد.");
    return { symbol, ok: false, periods: distinctPeriods(periods), months: monthRows.length, gaps };
  }
  return {
    symbol,
    ok: true,
    periods: distinctPeriods(periods),
    months: saved.months,
    gaps,
  };
}
