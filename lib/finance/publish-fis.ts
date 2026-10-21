import { fetchCodalDossier, fetchCodalReport } from "@/lib/finance/codal/fetch";
import {
  CodalShapeError,
  parseDividendPerShare,
  parseMonthlySalesHtml,
  parseStatementHtml,
  periodFromTitle,
  periodMonthsFromTitle,
  readSalesTrend,
  type CodalLetter,
  type FisStatementRole,
  type SalesPoint,
  type StatementFigures,
} from "@/lib/finance/codal/parse";
import { assessFis, FIS_PROPOSAL_VERSION, payoutPercent, salesGrowth, scoreFiscalYear, valuationBands, type FisFactor, type FisStatus } from "@/lib/finance/fis";
import { applyManualSheet, emptyStatement, parseStoredSheet, sheetHasNumbers, type ManualSheet } from "@/lib/finance/fis-manual";
import { buildFisObservation } from "@/lib/finance/fis-observe";
import { loadPortfolio, type FinanceClient } from "@/lib/finance/queries";
import type { Json, StockFundamentals } from "@/lib/finance/types";

export type FisStockReport = {
  symbol: string;
  owned: boolean;
  status: FisStatus;
  label: string;
  reason: string;
  score: number | null;
  previous_score: number | null;
  forward_pe: number | null;
  factors: FisFactor[];
  gaps: string[];
};

export type FisReportContent = {
  schema: typeof FIS_PROPOSAL_VERSION;
  akhza_percent: number;
  inflation_percent: number | null;
  inflation_fallback: boolean;
  buy_pe: number | null;
  exit_pe: number | null;
  stocks: FisStockReport[];
};

const statusLabels: Record<FisStatus, string> = {
  enter: "ورود",
  hold: "نگهداری",
  exit: "خروج",
  watch: "بررسی",
  excluded: "حذف پیش از امتیاز",
};

type ParsedStatement = {
  figures: StatementFigures;
  months: number | null;
  period: string | null;
  role: FisStatementRole;
};

async function mapPool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await run(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function annualEndings(current: ParsedStatement | null, older: { period: string; months: number | null }[]): string[] {
  const endings = older.filter((item) => (item.months ?? 0) >= 12).map((item) => item.period.slice(5));
  if (current?.period && (current.months ?? 0) >= 12) endings.unshift(current.period.slice(5));
  return endings;
}

function optionalNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readStatements(symbol: string, knownSales: SalesPoint[]): Promise<{
  current: ParsedStatement | null;
  prior: ParsedStatement | null;
  statementSalesGrowth: number | null;
  dividendRatio: number | null;
  salesPoints: SalesPoint[];
  olderPeriods: { period: string; months: number | null }[];
  error: string | null;
}> {
  const dossier = await fetchCodalDossier(symbol);
  if (!dossier) {
    return {
      current: null,
      prior: null,
      statementSalesGrowth: null,
      dividendRatio: null,
      salesPoints: knownSales,
      olderPeriods: [],
      error: "فهرست نامه‌های کدال خوانده نشد.",
    };
  }
  const parsed: ParsedStatement[] = [];
  let shapeError: string | null = null;
  for (const chosen of dossier.statements) {
    const period = periodFromTitle(chosen.letter.title);
    const report = await fetchCodalReport(chosen.letter);
    if (!report) {
      if (chosen.role === "latest") shapeError = "آخرین صورت مالی دریافت نشد.";
      continue;
    }
    try {
      parsed.push({
        figures: parseStatementHtml(report.html),
        months: periodMonthsFromTitle(chosen.letter.title),
        period,
        role: chosen.role,
      });
    } catch (error) {
      if (!(error instanceof CodalShapeError)) throw error;
      if (chosen.role === "latest") shapeError = error.message;
    }
  }
  const current = parsed.find((item) => item.role === "latest") ?? null;
  const prior = parsed.find((item) => item.role === "prior-interim") ?? null;
  const yoy = parsed.find((item) => item.role === "same-period-last-year") ?? null;
  const pairedGrowth = current && yoy && current.months === yoy.months
    ? salesGrowth(current.figures.sales, yoy.figures.sales)
    : null;
  const statementSalesGrowth = pairedGrowth ?? salesGrowth(current?.figures.sales ?? null, current?.figures.priorPeriodSales ?? null);
  const salesPoints = await fillMonthlySales(knownSales, dossier.monthly, current?.period ?? null, statementSalesGrowth != null);
  const dividendRatio = await dividendRatioFromLetters(parsed, dossier.dividends);
  return {
    current,
    prior,
    statementSalesGrowth,
    dividendRatio,
    salesPoints,
    olderPeriods: dossier.statements.flatMap((item) => {
      if (item.role === "latest") return [];
      const period = periodFromTitle(item.letter.title);
      return period ? [{ period, months: periodMonthsFromTitle(item.letter.title) }] : [];
    }),
    error: current ? null : shapeError ?? (dossier.statements.length === 0 ? "صورت مالی ن-۱۰ در جستجوی کدال پیدا نشد." : shapeError),
  };
}

async function fillMonthlySales(
  known: SalesPoint[],
  letters: CodalLetter[],
  period: string | null,
  haveStatementGrowth: boolean,
): Promise<SalesPoint[]> {
  if (haveStatementGrowth || !period) return known;
  const previous = shiftYear(period, -1);
  const have = new Set(known.map((point) => point.period));
  const needed = [period, previous].filter((item): item is string => item != null && !have.has(item));
  const points = [...known];
  for (const letter of letters) {
    const letterPeriod = periodFromTitle(letter.title);
    if (!letterPeriod || !needed.includes(letterPeriod)) continue;
    const report = await fetchCodalReport(letter);
    if (!report) continue;
    try {
      points.push(parseMonthlySalesHtml(report.html, letter.title));
    } catch (error) {
      if (!(error instanceof CodalShapeError)) throw error;
    }
  }
  return points;
}

function shiftYear(period: string, years: number): string | null {
  const match = /^(\d{4})\/(\d{2}\/\d{2})$/.exec(period);
  if (!match) return null;
  return `${Number(match[1]) + years}/${match[2]}`;
}

async function dividendRatioFromLetters(statements: ParsedStatement[], letters: CodalLetter[]): Promise<number | null> {
  const annuals = statements.filter((item) => (item.months ?? 0) >= 12 && item.period);
  if (annuals.length < 2) return null;
  const ratios: number[] = [];
  for (const letter of letters) {
    const period = periodFromTitle(letter.title);
    const year = period?.slice(0, 4);
    const statement = year ? annuals.find((item) => item.period?.startsWith(`${year}/`)) : null;
    if (!statement) continue;
    const report = await fetchCodalReport(letter);
    if (!report) continue;
    const perShare = parseDividendPerShare(report.html);
    const ratio = payoutPercent(perShare, statement.figures.netIncome, statement.figures.periodEps, statement.figures.retainedEarnings);
    if (ratio == null) continue;
    ratios.push(ratio);
    if (ratios.length === 2) break;
  }
  if (ratios.length < 2) return null;
  return ((ratios[0] ?? 0) + (ratios[1] ?? 0)) / 2;
}

function previousScores(rows: { content: Json }[]): Map<string, number | null> {
  const scores = new Map<string, number | null>();
  for (const row of rows) {
    const content = row.content;
    if (!content || typeof content !== "object" || Array.isArray(content)) continue;
    if (content.schema !== FIS_PROPOSAL_VERSION || !Array.isArray(content.stocks)) continue;
    for (const stock of content.stocks) {
      if (!stock || typeof stock !== "object" || Array.isArray(stock)) continue;
      const symbol = typeof stock.symbol === "string" ? stock.symbol : "";
      if (!symbol || scores.has(symbol)) continue;
      scores.set(symbol, typeof stock.score === "number" ? stock.score : null);
    }
    if (scores.size > 0) break;
  }
  return scores;
}

export async function publishFisReport(
  supabase: FinanceClient,
  akhzaPercent: number,
  inflationPercent: number | null,
  options?: { only?: string | null; sheet?: ManualSheet | null; sheetSymbol?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; code: "save" | "portfolio" | "symbol" }> {
  const portfolio = await loadPortfolio(supabase);
  if (!portfolio.ok) return { ok: false, code: "portfolio" };
  const bySymbol = new Map<string, (typeof portfolio.data.holdings)[number]>();
  for (const holding of portfolio.data.holdings) {
    if (holding.type === "stock" && holding.quantity > 0 && !bySymbol.has(holding.symbol)) bySymbol.set(holding.symbol, holding);
  }
  const wanted = options?.only?.trim();
  const stocks = wanted ? [...bySymbol.values()].filter((holding) => holding.symbol === wanted) : [...bySymbol.values()];
  if (wanted && stocks.length === 0) return { ok: false, code: "symbol" };
  const symbols = stocks.map((holding) => holding.symbol);
  const fundamentals = new Map<string, StockFundamentals>();
  if (symbols.length > 0) {
    const { data, error } = await supabase.from("stock_fundamentals").select("*").in("symbol", symbols);
    if (!error && data) {
      for (const row of data as StockFundamentals[]) fundamentals.set(row.symbol, row);
    }
  }
  const history = await supabase
    .from("reports")
    .select("content, created_at")
    .eq("type", "period")
    .order("created_at", { ascending: false })
    .limit(12);
  const priorScores = history.error ? new Map<string, number | null>() : previousScores(history.data ?? []);
  const bands = valuationBands(akhzaPercent);
  const assessed = await mapPool(stocks, 2, async (holding) => {
    const fundamental = fundamentals.get(holding.symbol);
    const knownSales = readSalesTrend(fundamental?.sales_trend ?? []);
    const statements = await readStatements(holding.symbol, knownSales);
    const posted = options?.sheetSymbol === holding.symbol ? options?.sheet ?? null : null;
    const stored = parseStoredSheet(fundamental?.manual_sheet);
    const sheet = posted && sheetHasNumbers(posted) ? posted : stored;
    const manual = sheetHasNumbers(sheet);
    const figures = applyManualSheet(statements.current?.figures ?? null, sheet);
    const months = sheet?.months ?? statements.current?.months ?? null;
    const priorBase = statements.prior?.figures ?? null;
    const priorFigures = sheet && (sheet.priorSales != null || sheet.priorOperatingProfit != null)
      ? {
        ...(priorBase ?? emptyStatement()),
        sales: sheet.priorSales ?? priorBase?.sales ?? null,
        operatingProfit: sheet.priorOperatingProfit ?? priorBase?.operatingProfit ?? null,
      }
      : priorBase;
    const priorMonths = sheet?.priorMonths ?? statements.prior?.months ?? null;
    const sameYear = Boolean(
      (statements.current?.period && statements.prior?.period && statements.current.period.slice(0, 4) === statements.prior.period.slice(0, 4))
      || (sheet?.priorMonths != null && months != null && priorMonths != null && months > priorMonths),
    );
    const manualGrowth = sheet?.priorPeriodSales != null ? salesGrowth(figures?.sales ?? null, sheet.priorPeriodSales) : null;
    const observation = buildFisObservation({
      price: sheet?.price ?? holding.price,
      months,
      current: figures,
      prior: priorFigures,
      priorMonths,
      sameFiscalYear: sameYear,
      salesPoints: statements.salesPoints,
      period: statements.current?.period ?? null,
      fiscalYearScore: sheet?.fiscalYearScore ?? scoreFiscalYear(months, annualEndings(statements.current, statements.olderPeriods)),
      ttmEps: sheet?.ttmEps ?? optionalNumber(fundamental?.eps),
      owned: true,
      previousScore: priorScores.get(holding.symbol) ?? null,
      statementSalesGrowthPercent: manualGrowth ?? statements.statementSalesGrowth,
      dividendRatioPercent: sheet?.dividendRatioPercent ?? statements.dividendRatio,
    });
    if (manual) observation.gaps.unshift("عددهایی که در فرم پر شده، به‌جای کدال نشسته‌اند.");
    if (statements.error && !figures) observation.gaps.unshift(statements.error);
    if (!figures) observation.gaps.unshift("صورت مالی قابل‌خواندن از کدال پیدا نشد.");
    const result = assessFis(observation, akhzaPercent, inflationPercent);
    return {
      fallback: result.inflationFallback,
      stock: {
        symbol: holding.symbol,
        owned: true,
        status: result.status,
        label: statusLabels[result.status],
        reason: result.reason,
        score: result.score,
        previous_score: observation.previousScore,
        forward_pe: observation.forwardPe,
        factors: result.factors,
        gaps: observation.gaps,
      } satisfies FisStockReport,
    };
  });
  const inflationFallback = inflationPercent == null || assessed.some((item) => item.fallback);

  const content: FisReportContent = {
    schema: FIS_PROPOSAL_VERSION,
    akhza_percent: akhzaPercent,
    inflation_percent: inflationPercent,
    inflation_fallback: inflationFallback,
    buy_pe: bands?.buyPe ?? null,
    exit_pe: bands?.exitPe ?? null,
    stocks: assessed.map((item) => item.stock),
  };
  const { data, error } = await supabase
    .from("reports")
    .insert({ type: "period", content: content as unknown as Json })
    .select("id")
    .single();
  if (error || !data) return { ok: false, code: "save" };
  return { ok: true, id: data.id };
}

function isFactor(value: Json): value is FisFactor {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return typeof value.key === "string"
    && typeof value.label === "string"
    && typeof value.max === "number"
    && typeof value.score === "number"
    && (value.value == null || typeof value.value === "number")
    && (value.note == null || typeof value.note === "string");
}

const statuses = new Set<FisStatus>(["enter", "hold", "exit", "watch", "excluded"]);

export function parseFisContent(value: Json): FisReportContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.schema !== FIS_PROPOSAL_VERSION || !Array.isArray(value.stocks)) return null;
  if (typeof value.akhza_percent !== "number") return null;
  const stocks: FisStockReport[] = [];
  for (const stock of value.stocks) {
    if (!stock || typeof stock !== "object" || Array.isArray(stock)) return null;
    if (typeof stock.symbol !== "string" || typeof stock.status !== "string" || !statuses.has(stock.status as FisStatus)) return null;
    if (!Array.isArray(stock.factors) || !stock.factors.every(isFactor)) return null;
    stocks.push({
      symbol: stock.symbol,
      owned: stock.owned === true,
      status: stock.status as FisStatus,
      label: typeof stock.label === "string" ? stock.label : stock.status,
      reason: typeof stock.reason === "string" ? stock.reason : "",
      score: typeof stock.score === "number" ? stock.score : null,
      previous_score: typeof stock.previous_score === "number" ? stock.previous_score : null,
      forward_pe: typeof stock.forward_pe === "number" ? stock.forward_pe : null,
      factors: stock.factors.filter(isFactor),
      gaps: Array.isArray(stock.gaps) ? stock.gaps.filter((gap): gap is string => typeof gap === "string") : [],
    });
  }
  return {
    schema: FIS_PROPOSAL_VERSION,
    akhza_percent: value.akhza_percent,
    inflation_percent: typeof value.inflation_percent === "number" ? value.inflation_percent : null,
    inflation_fallback: value.inflation_fallback === true,
    buy_pe: typeof value.buy_pe === "number" ? value.buy_pe : null,
    exit_pe: typeof value.exit_pe === "number" ? value.exit_pe : null,
    stocks,
  };
}
