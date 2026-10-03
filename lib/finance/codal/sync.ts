import { dispatchAlertNotifications } from "@/lib/notify/dispatch";
import { userIdFromClaims } from "@/lib/supabase/env";
import type { FinanceClient, LoadResult } from "@/lib/finance/queries";
import { fetchListedQuote } from "@/lib/finance/prices/listed";
import { fetchCodalLetters, fetchCodalReport } from "@/lib/finance/codal/fetch";
import {
  CodalShapeError,
  assembleFundamentals,
  epsMeaningfullyChanged,
  isEarningsRevision,
  mergeSalesTrend,
  parseMonthlySalesHtml,
  parseStatementHtml,
  periodMonthsFromTitle,
  readSalesTrend,
  selectMonthlyLetters,
  selectStatementLetter,
  type SalesPoint,
} from "@/lib/finance/codal/parse";
import type { Numeric, StockFundamentals } from "@/lib/finance/types";

const FRESH_OK_MS = 6 * 60 * 60 * 1000;
const FRESH_ERROR_MS = 60 * 60 * 1000;
const MONTHLY_LIMIT = 4;
const LIST_FAILURE = "فهرست گزارش‌های کدال خوانده نشد. اگر ساختار سایت عوض شده باشد، پارس بعدی باید به‌روز شود.";

export const CODAL_NOTICE_KIND = "codal_notice" as const;

export type CodalSnapshot = {
  symbol: string;
  pe: number | null;
  eps: number | null;
  roe: number | null;
  profitMargin: number | null;
  salesTrend: SalesPoint[];
  latestTitle: string | null;
  publishedLabel: string | null;
  adjusted: boolean;
  shapeError: string | null;
  source: string;
  alerted: boolean;
};

function schemaGap(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.code === "42703" ||
    error.code === "42P01" ||
    /schema cache|does not exist|could not find the/i.test(error.message ?? "")
  );
}

function numericOrNull(value: Numeric | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

async function readStatement(letter: Awaited<ReturnType<typeof selectStatementLetter>>): Promise<{
  figures: { sales: number | null; netIncome: number | null; equity: number | null; periodEps: number | null };
  notes: string[];
  source: string | null;
}> {
  const empty = { sales: null, netIncome: null, equity: null, periodEps: null };
  if (!letter) return { figures: empty, notes: [], source: null };
  const report = await fetchCodalReport(letter);
  if (!report) return { figures: empty, notes: ["فایل صورت مالی کدال دریافت نشد."], source: null };
  try {
    const figures = parseStatementHtml(report.html);
    return { figures, notes: [], source: report.source };
  } catch (error) {
    const message = error instanceof CodalShapeError ? error.message : "صورت مالی کدال خوانده نشد.";
    return { figures: empty, notes: [message], source: report.source };
  }
}

async function readMonthlySales(letters: ReturnType<typeof selectMonthlyLetters>): Promise<{ points: SalesPoint[]; notes: string[] }> {
  const parsed = await Promise.all(
    letters.map(async (letter) => {
      const report = await fetchCodalReport(letter);
      if (!report) return { point: null, note: "فایل گزارش ماهانه کدال دریافت نشد." };
      try {
        return { point: parseMonthlySalesHtml(report.html, letter.title), note: null };
      } catch (error) {
        const message = error instanceof CodalShapeError ? error.message : "گزارش ماهانه کدال خوانده نشد.";
        return { point: null, note: message };
      }
    }),
  );
  return {
    points: parsed.flatMap((item) => (item.point ? [item.point] : [])),
    notes: parsed.flatMap((item) => (item.note ? [item.note] : [])),
  };
}

async function mapPool<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (current !== undefined) await run(current);
    }
  });
  await Promise.all(workers);
}

export async function syncSymbolFundamentals(
  supabase: FinanceClient,
  userId: string,
  symbol: string,
): Promise<LoadResult<CodalSnapshot>> {
  const existing = await supabase.from("stock_fundamentals").select("*").eq("symbol", symbol).maybeSingle();
  if (existing.error) {
    console.error(existing.error);
    return { ok: false, missingSchema: schemaGap(existing.error) };
  }
  const previous = (existing.data ?? null) as StockFundamentals | null;
  const previousTrend = previous ? readSalesTrend(previous.sales_trend) : [];
  const previousEps = previous ? numericOrNull(previous.eps) : null;

  const loaded = await fetchCodalLetters(symbol);
  const shapeNotes: string[] = [];
  let source = loaded?.source ?? "codal";
  const letters = loaded?.letters ?? [];
  if (!loaded) shapeNotes.push(LIST_FAILURE);

  const newest = letters.slice().sort((left, right) => right.tracingNo - left.tracingNo)[0] ?? null;
  const statementLetter = selectStatementLetter(letters);
  const monthlyLetters = selectMonthlyLetters(letters, MONTHLY_LIMIT);

  const months = statementLetter ? periodMonthsFromTitle(statementLetter.title) : null;
  const [statementOutcome, monthlyOutcome, quote] = await Promise.all([
    readStatement(statementLetter),
    readMonthlySales(monthlyLetters),
    fetchListedQuote(symbol),
  ]);
  const { sales, netIncome, equity, periodEps } = statementOutcome.figures;
  shapeNotes.push(...statementOutcome.notes);
  if (monthlyOutcome.points.length === 0) shapeNotes.push(...monthlyOutcome.notes);
  if (statementOutcome.source) source = `${source}+${statementOutcome.source}`.slice(0, 80);
  const incomingSales = monthlyOutcome.points;
  const numbers = assembleFundamentals({
    sales,
    netIncome,
    equity,
    periodEps,
    months,
    marketEps: quote?.eps ?? null,
    price: quote?.price ?? null,
  });
  if (quote) source = `${source}+${quote.source}`.slice(0, 80);

  const parsed = sales != null && netIncome != null;
  const pe = parsed ? numbers.pe ?? numericOrNull(previous?.pe) : numericOrNull(previous?.pe);
  const eps = parsed ? numbers.eps ?? previousEps : previousEps;
  const roe = parsed ? numbers.roe ?? numericOrNull(previous?.roe) : numericOrNull(previous?.roe);
  const profitMargin = parsed ? numbers.profitMargin ?? numericOrNull(previous?.profit_margin) : numericOrNull(previous?.profit_margin);
  const salesTrend = mergeSalesTrend(previousTrend, incomingSales);
  const titleAdjusted = newest ? isEarningsRevision(newest) : false;
  const statementIsNewest = Boolean(newest && statementLetter && newest.tracingNo === statementLetter.tracingNo);
  const adjusted = titleAdjusted || (statementIsNewest && epsMeaningfullyChanged(previousEps, numbers.eps));
  const shapeError = shapeNotes.length > 0 ? clip([...new Set(shapeNotes)].join(" "), 300) : null;

  const saved = await supabase.from("stock_fundamentals").upsert(
    {
      user_id: userId,
      symbol,
      pe,
      eps,
      roe,
      profit_margin: profitMargin,
      sales_trend: salesTrend,
      latest_tracing_no: newest ? String(newest.tracingNo) : previous?.latest_tracing_no ?? null,
      latest_title: newest ? clip(newest.title, 400) : previous?.latest_title ?? null,
      published_label: newest?.publishedLabel ? clip(newest.publishedLabel, 40) : previous?.published_label ?? null,
      adjusted,
      source: clip(source, 80),
      shape_error: shapeError,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "user_id,symbol" },
  );
  if (saved.error) {
    console.error(saved.error);
    return { ok: false, missingSchema: schemaGap(saved.error) };
  }

  const previousTracing = previous?.latest_tracing_no ?? null;
  const nextTracing = newest ? String(newest.tracingNo) : null;
  let alerted = false;
  if (previousTracing && nextTracing && previousTracing !== nextTracing && newest) {
    const rule = clip(`${adjusted ? "تعدیل سود" : "گزارش جدید"} ${symbol} · ${newest.tracingNo}`, 200);
    const lead = adjusted
      ? `سود ${symbol} در کدال تعدیل یا اصلاح شد.`
      : `گزارش جدید کدال برای ${symbol} منتشر شد.`;
    const message = clip(`${lead} ${newest.title}`, 500);
    const inserted = await supabase.from("alerts").insert({
      kind: CODAL_NOTICE_KIND,
      asset_type: "stock",
      rule,
      message,
      threshold: eps ?? 0,
      channel: "in_app",
      frequency: "immediate",
      is_active: true,
    });
    if (inserted.error && inserted.error.code !== "23505") {
      console.error(inserted.error);
    } else if (!inserted.error) {
      alerted = true;
      await dispatchAlertNotifications(supabase);
    }
  }

  return {
    ok: true,
    data: {
      symbol,
      pe,
      eps,
      roe,
      profitMargin,
      salesTrend,
      latestTitle: newest?.title ?? previous?.latest_title ?? null,
      publishedLabel: newest?.publishedLabel || previous?.published_label || null,
      adjusted,
      shapeError,
      source,
      alerted,
    },
  };
}

export async function ensureStockFundamentals(supabase: FinanceClient): Promise<void> {
  try {
    const { data } = await supabase.auth.getClaims();
    const userId = userIdFromClaims(data?.claims);
    if (!userId) return;

    const assets = await supabase.from("assets").select("symbol").eq("type", "stock");
    if (assets.error || !assets.data?.length) {
      if (assets.error) console.error(assets.error);
      return;
    }
    const symbols = [...new Set(assets.data.map((row) => row.symbol.trim()).filter(Boolean))];
    if (symbols.length === 0) return;

    const stored = await supabase
      .from("stock_fundamentals")
      .select("symbol,fetched_at,shape_error")
      .in("symbol", symbols);
    if (stored.error) {
      console.error(stored.error);
      return;
    }

    const bySymbol = new Map((stored.data ?? []).map((row) => [row.symbol, row]));
    const stale = symbols.filter((symbol) => {
      const row = bySymbol.get(symbol);
      if (!row) return true;
      const age = Date.now() - new Date(row.fetched_at).getTime();
      return age >= (row.shape_error ? FRESH_ERROR_MS : FRESH_OK_MS);
    });
    await mapPool(stale, 2, async (symbol) => {
      const result = await syncSymbolFundamentals(supabase, userId, symbol);
      if (!result.ok) console.error(`[codal] ${symbol} was not stored`);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[codal] ensure failed: ${message}`);
  }
}
