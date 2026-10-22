import { fetchCodalDossier, fetchCodalReport } from "@/lib/finance/codal/fetch";
import { fetchRahavardFundamentals } from "@/lib/finance/rahavard/statements";
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
import { latestScoreBySymbol, resolvePreviousScore } from "@/lib/finance/history";
import { applyManualSheet, emptyStatement, parseStoredSheet, sheetHasNumbers, type ManualSheet } from "@/lib/finance/fis-manual";
import { buildFisObservation } from "@/lib/finance/fis-observe";
import { groupTrendRows, type StoredTrendRow } from "@/lib/finance/trend/read";
import { seasonalForwardPe } from "@/lib/finance/trend/seasonal";
import type { TrendPeriod } from "@/lib/finance/trend/series";
import type { FisChangeSnapshot } from "@/lib/finance/fis-change";
import { loadBook, loadPortfolio, type FinanceClient } from "@/lib/finance/queries";
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
  forward_pe_seasonal: number | null;
  seasonal_gaps: string[];
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
  source?: FisFeed;
  stocks: FisStockReport[];
};

export type FisFeed = "codal" | "rahavard";

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
  ttmEps: number | null;
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
      ttmEps: null,
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
    ttmEps: null,
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

function schemaGap(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST204"
    || error.code === "PGRST205"
    || error.code === "42703"
    || error.code === "42P01"
    || /schema cache|does not exist|could not find the/i.test(error.message ?? "")
  );
}

function scoreOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

async function readRahavard(symbol: string): Promise<{
  current: ParsedStatement | null;
  prior: ParsedStatement | null;
  statementSalesGrowth: number | null;
  dividendRatio: number | null;
  salesPoints: SalesPoint[];
  olderPeriods: { period: string; months: number | null }[];
  ttmEps: number | null;
  error: string | null;
}> {
  const read = await fetchRahavardFundamentals(symbol);
  return {
    current: read.current ? { ...read.current, role: "latest" } : null,
    prior: read.prior ? { ...read.prior, role: "prior-interim" } : null,
    statementSalesGrowth: read.statementSalesGrowth,
    dividendRatio: read.dividendRatio,
    salesPoints: [],
    olderPeriods: read.olderPeriods,
    ttmEps: read.ttmEps,
    error: read.error,
  };
}

type TrendHistory =
  | { ok: true; bySymbol: Map<string, TrendPeriod[]>; gaps: Map<string, string[]> }
  | { ok: false; missing: boolean };

async function loadTrendHistory(supabase: FinanceClient, symbols: string[]): Promise<TrendHistory> {
  if (symbols.length === 0) return { ok: true, bySymbol: new Map(), gaps: new Map() };
  const result = await supabase
    .from("stock_periods")
    .select("symbol, period, months, tracing_no, revision_of, figures")
    .in("symbol", symbols);
  if (result.error) {
    if (!schemaGap(result.error)) console.error(result.error);
    return { ok: false, missing: schemaGap(result.error) };
  }
  const stored: StoredTrendRow[] = (result.data ?? []).map((row) => ({
    symbol: row.symbol,
    period: row.period,
    months: row.months,
    tracingNo: row.tracing_no,
    revisionOf: row.revision_of,
    figures: row.figures,
  }));
  return { ok: true, ...groupTrendRows(stored) };
}

function seasonalFor(
  history: TrendHistory,
  symbol: string,
  price: number | null,
): { forwardPe: number | null; gaps: string[] } {
  if (!history.ok) {
    return {
      forwardPe: null,
      gaps: [history.missing ? "جدول تاریخچه برای نسبت فصلی موجود نیست." : "تاریخچهٔ صورت‌ها برای نسبت فصلی خوانده نشد."],
    };
  }
  const periods = history.bySymbol.get(symbol) ?? [];
  const unread = history.gaps.get(symbol) ?? [];
  if (periods.length === 0) {
    return { forwardPe: null, gaps: [...unread, "تاریخچهٔ صورت برای نسبت فصلی ذخیره نشده است."] };
  }
  const seasonal = seasonalForwardPe(periods, price);
  return { forwardPe: seasonal.forwardPe, gaps: [...unread, ...seasonal.gaps] };
}

export async function publishFisReport(
  supabase: FinanceClient,
  akhzaPercent: number,
  inflationPercent: number | null,
  options?: { only?: string | null; sheet?: ManualSheet | null; sheetSymbol?: string | null; source?: FisFeed | null },
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
  const reportedScores = history.error ? new Map<string, number | null>() : previousScores(history.data ?? []);
  const storedScores = new Map<string, number | null>();
  if (symbols.length > 0) {
    const scoreHistory = await supabase
      .from("stock_scores")
      .select("symbol, score, as_of")
      .in("symbol", symbols)
      .order("as_of", { ascending: false });
    if (scoreHistory.error) {
      if (!schemaGap(scoreHistory.error)) console.error(scoreHistory.error);
    } else {
      const latest = latestScoreBySymbol((scoreHistory.data ?? []).map((row) => ({
        symbol: row.symbol,
        asOf: row.as_of,
        score: scoreOrNull(row.score),
      })));
      for (const [symbol, score] of latest) storedScores.set(symbol, score);
    }
  }
  const trendHistory = await loadTrendHistory(supabase, symbols);
  const bands = valuationBands(akhzaPercent);
  const feed: FisFeed = options?.source === "rahavard" ? "rahavard" : "codal";
  const feedLabel = feed === "rahavard" ? "رهاورد" : "کدال";
  const assessed = await mapPool(stocks, 2, async (holding) => {
    const fundamental = fundamentals.get(holding.symbol);
    const knownSales = readSalesTrend(fundamental?.sales_trend ?? []);
    const statements = feed === "rahavard" ? await readRahavard(holding.symbol) : await readStatements(holding.symbol, knownSales);
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
      ttmEps: sheet?.ttmEps ?? statements.ttmEps ?? optionalNumber(fundamental?.eps),
      owned: true,
      previousScore: resolvePreviousScore(
        storedScores.has(holding.symbol) ? storedScores.get(holding.symbol) ?? null : undefined,
        reportedScores.get(holding.symbol) ?? null,
      ),
      statementSalesGrowthPercent: manualGrowth ?? statements.statementSalesGrowth,
      dividendRatioPercent: sheet?.dividendRatioPercent ?? statements.dividendRatio,
    });
    if (manual) observation.gaps.unshift(`عددهایی که در فرم پر شده، به‌جای ${feedLabel} نشسته‌اند.`);
    if (statements.error && !figures) observation.gaps.unshift(statements.error);
    if (!figures) observation.gaps.unshift(`صورت مالی قابل‌خواندن از ${feedLabel} پیدا نشد.`);
    const result = assessFis(observation, akhzaPercent, inflationPercent);
    const seasonal = seasonalFor(trendHistory, holding.symbol, holding.price);
    return {
      fallback: result.inflationFallback,
      observation,
      stock: {
        symbol: holding.symbol,
        owned: true,
        status: result.status,
        label: statusLabels[result.status],
        reason: result.reason,
        score: result.score,
        previous_score: observation.previousScore,
        forward_pe: observation.forwardPe,
        forward_pe_seasonal: seasonal.forwardPe,
        seasonal_gaps: seasonal.gaps,
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
    source: feed,
    stocks: assessed.map((item) => item.stock),
  };
  const { data, error } = await supabase
    .from("reports")
    .insert({ type: "period", content: content as unknown as Json })
    .select("id")
    .single();
  if (error || !data) return { ok: false, code: "save" };
  if (assessed.length > 0) {
    const asOf = new Date().toISOString();
    const scored = await supabase.from("stock_scores").insert(assessed.map((item) => ({
      symbol: item.stock.symbol,
      as_of: asOf,
      trigger: "manual" as const,
      score: item.stock.score,
      status: item.stock.status,
      model_version: FIS_PROPOSAL_VERSION,
      factors: item.stock.factors as unknown as Json,
      observation: item.observation as unknown as Json,
      forward_pe: item.stock.forward_pe,
    })));
    if (scored.error) {
      console.error(scored.error);
      if (!schemaGap(scored.error)) {
        await supabase.from("reports").delete().eq("id", data.id);
        return { ok: false, code: "save" };
      }
    }
  }
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
      forward_pe_seasonal: typeof stock.forward_pe_seasonal === "number" ? stock.forward_pe_seasonal : null,
      seasonal_gaps: Array.isArray(stock.seasonal_gaps) ? stock.seasonal_gaps.filter((gap): gap is string => typeof gap === "string") : [],
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
    source: value.source === "rahavard" || value.source === "codal" ? value.source : undefined,
    stocks,
  };
}

function changeFactors(value: Json): FisChangeSnapshot["factors"] {
  if (!Array.isArray(value)) return [];
  return value.filter(isFactor).map((factor) => ({ key: factor.key, label: factor.label, score: factor.score }));
}

/**
 * Scores one owned symbol from Codal after a new statement was stored.
 * Every read and the score insert filter on userId. No period report is written.
 * The session publishFisReport path is unchanged and still relies on the caller session.
 */
export async function publishSymbolFis(
  supabase: FinanceClient,
  userId: string,
  symbol: string,
): Promise<
  | { ok: true; previous: FisChangeSnapshot | null; next: FisChangeSnapshot }
  | { ok: false; code: "portfolio" | "symbol" | "akhza" | "statement" | "save" }
> {
  const book = await loadBook(supabase, userId);
  if (!book.ok) return { ok: false, code: "portfolio" };
  const holding = book.data.snapshot.holdings.find((item) => item.type === "stock" && item.symbol === symbol && item.quantity > 0);
  if (!holding) return { ok: false, code: "symbol" };

  const fundamentalResult = await supabase
    .from("stock_fundamentals")
    .select("*")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .maybeSingle();
  if (fundamentalResult.error) console.error(fundamentalResult.error);
  const fundamental = (fundamentalResult.data ?? null) as StockFundamentals | null;

  const scoreHistory = await supabase
    .from("stock_scores")
    .select("status, score, factors")
    .eq("user_id", userId)
    .eq("symbol", symbol)
    .order("as_of", { ascending: false })
    .limit(1);
  if (scoreHistory.error) {
    console.error(scoreHistory.error);
    return { ok: false, code: "save" };
  }
  const stored = scoreHistory.data?.[0] ?? null;

  const history = await supabase
    .from("reports")
    .select("content")
    .eq("user_id", userId)
    .eq("type", "period")
    .order("created_at", { ascending: false })
    .limit(8);
  if (history.error) {
    console.error(history.error);
    return { ok: false, code: "akhza" };
  }
  let report: FisReportContent | null = null;
  for (const row of history.data ?? []) {
    report = parseFisContent(row.content);
    if (report) break;
  }
  if (!report) return { ok: false, code: "akhza" };

  const reported = report.stocks.find((stock) => stock.symbol === symbol) ?? null;
  let previous: FisChangeSnapshot | null = reported
    ? {
      status: reported.status,
      score: reported.score,
      factors: reported.factors.map((factor) => ({ key: factor.key, label: factor.label, score: factor.score })),
    }
    : null;
  if (stored) {
    if (!statuses.has(stored.status as FisStatus)) {
      console.error(`[fis] ${symbol} stored status was not readable`);
      previous = null;
    } else {
      previous = {
        status: stored.status as FisStatus,
        score: scoreOrNull(stored.score),
        factors: changeFactors(stored.factors),
      };
    }
  }

  const knownSales = readSalesTrend(fundamental?.sales_trend ?? []);
  const statements = await readStatements(symbol, knownSales);
  const sheet = parseStoredSheet(fundamental?.manual_sheet);
  const manual = sheetHasNumbers(sheet);
  const figures = applyManualSheet(statements.current?.figures ?? null, sheet);
  if (!figures) return { ok: false, code: "statement" };
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
  const manualGrowth = sheet?.priorPeriodSales != null ? salesGrowth(figures.sales, sheet.priorPeriodSales) : null;
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
    ttmEps: sheet?.ttmEps ?? statements.ttmEps ?? optionalNumber(fundamental?.eps),
    owned: true,
    previousScore: resolvePreviousScore(stored ? scoreOrNull(stored.score) : undefined, reported?.score ?? null),
    statementSalesGrowthPercent: manualGrowth ?? statements.statementSalesGrowth,
    dividendRatioPercent: sheet?.dividendRatioPercent ?? statements.dividendRatio,
  });
  if (manual) observation.gaps.unshift("عددهایی که در فرم پر شده، به‌جای کدال نشسته‌اند.");
  const result = assessFis(observation, report.akhza_percent, report.inflation_percent);
  const next: FisChangeSnapshot = {
    status: result.status,
    score: result.score,
    factors: result.factors.map((factor) => ({ key: factor.key, label: factor.label, score: factor.score })),
  };
  const scored = await supabase.from("stock_scores").insert({
    user_id: userId,
    symbol,
    as_of: new Date().toISOString(),
    trigger: "statement" as const,
    score: result.score,
    status: result.status,
    model_version: FIS_PROPOSAL_VERSION,
    factors: result.factors as unknown as Json,
    observation: observation as unknown as Json,
    forward_pe: observation.forwardPe,
  });
  if (scored.error) {
    console.error(scored.error);
    return { ok: false, code: "save" };
  }
  return { ok: true, previous, next };
}
