import type { FinanceClient } from "@/lib/finance/queries";
import type { Json } from "@/lib/finance/types";
import { userIdFromClaims } from "@/lib/supabase/env";
import { fetchText } from "@/lib/finance/prices/tgju";
import { matchListedSymbol, parseTsetmcSearch } from "@/lib/finance/prices/listed";
import { fetchRahavardProfile, type RahavardProfile } from "@/lib/finance/prices/rahavard";
import { parseTsetmcDailyCloses, returnsFromCloses, appendLiveClose, type CloseBar, type ReturnReport } from "@/lib/finance/prices/returns";

const CDN = "https://cdn.tsetmc.com";
const FRESH_OK_MS = 6 * 60 * 60 * 1000;
const FRESH_EMPTY_MS = 60 * 60 * 1000;

export type MarketReport = {
  lastPrice: number | null;
  dailyChange: number | null;
  dailyPercent: number | null;
  monthPercent: number | null;
  quarterPercent: number | null;
  yearPercent: number | null;
  volume: number | null;
  tradeValue: number | null;
  marketCap: number | null;
  freeFloatPercent: number | null;
  pb: number | null;
  dps: number | null;
  industry: string | null;
  state: string | null;
  source: string;
  capturedAt: string;
  version: number;
};

function pickNumber(primary: number | null | undefined, secondary: number | null | undefined): number | null {
  return primary ?? secondary ?? null;
}

export function buildMarketReport(input: {
  closes: ReturnReport | null;
  profile: RahavardProfile | null;
  capturedAt: string;
}): MarketReport {
  const closes = input.closes;
  const profile = input.profile;
  const parts = [closes?.lastClose != null ? "tsetmc-daily" : null, profile ? "rahavard" : null].filter(
    (part): part is string => Boolean(part),
  );
  return {
    lastPrice: pickNumber(closes?.lastClose, profile?.price),
    dailyChange: pickNumber(closes?.dailyChange, profile?.dailyChange),
    dailyPercent: pickNumber(closes?.dailyPercent, profile?.dailyPercent),
    monthPercent: closes?.monthPercent ?? null,
    quarterPercent: pickNumber(closes?.quarterPercent, profile?.quarterPercent),
    yearPercent: pickNumber(closes?.yearPercent, profile?.yearPercent),
    volume: profile?.volume ?? null,
    tradeValue: profile?.tradeValue ?? null,
    marketCap: profile?.marketCap ?? null,
    freeFloatPercent: profile?.freeFloatPercent ?? null,
    pb: profile?.pb ?? null,
    dps: profile?.dps ?? null,
    industry: profile?.industry ?? null,
    state: profile?.state ?? null,
    source: (parts.join("+") || "unavailable").slice(0, 80),
    capturedAt: input.capturedAt,
    version: 2,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readMarketReport(value: Json | unknown): MarketReport | null {
  const record = asRecord(value);
  const capturedAt = text(record?.capturedAt);
  if (!record || !capturedAt) return null;
  return {
    lastPrice: finite(record.lastPrice),
    dailyChange: finite(record.dailyChange),
    dailyPercent: finite(record.dailyPercent),
    monthPercent: finite(record.monthPercent),
    quarterPercent: finite(record.quarterPercent),
    yearPercent: finite(record.yearPercent),
    volume: finite(record.volume),
    tradeValue: finite(record.tradeValue),
    marketCap: finite(record.marketCap),
    freeFloatPercent: finite(record.freeFloatPercent),
    pb: finite(record.pb),
    dps: finite(record.dps),
    industry: text(record.industry),
    state: text(record.state),
    source: text(record.source) ?? "unavailable",
    capturedAt,
    version: finite(record.version) ?? 0,
  };
}

export function tehranDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return Number(parts.replaceAll("-", ""));
}

async function closeBars(symbol: string): Promise<CloseBar[]> {
  const search = JSON.parse(
    await fetchText(`${CDN}/api/Instrument/GetInstrumentSearch/${encodeURIComponent(symbol)}`, 8_000),
  ) as unknown;
  const match = matchListedSymbol(parseTsetmcSearch(search), symbol);
  if (!match) throw new Error(`no exact listing for ${symbol}`);
  const daily = JSON.parse(
    await fetchText(`${CDN}/api/ClosingPrice/GetClosingPriceDailyList/${match.insCode}/0`, 12_000),
  ) as unknown;
  return parseTsetmcDailyCloses(daily);
}

export async function fetchMarketReport(symbol: string, now = new Date()): Promise<MarketReport> {
  const asOf = tehranDay(now);
  let bars: CloseBar[] | null = null;
  let profile: RahavardProfile | null = null;
  try {
    bars = await closeBars(symbol);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[prices] daily history ${symbol} skipped: ${message}`);
  }
  try {
    profile = await fetchRahavardProfile(symbol);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[prices] rahavard ${symbol} skipped: ${message}`);
  }
  const series = bars ? appendLiveClose(bars, asOf, profile?.price ?? null) : null;
  return buildMarketReport({
    closes: series ? returnsFromCloses(series, asOf) : null,
    profile,
    capturedAt: now.toISOString(),
  });
}

function reportAge(value: Json, now: number): number | null {
  const report = readMarketReport(value);
  if (!report) return null;
  const captured = new Date(report.capturedAt).getTime();
  if (!Number.isFinite(captured)) return null;
  return now - captured;
}

async function mapPool(symbols: string[], limit: number, run: (symbol: string) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, symbols.length) }, async () => {
    while (index < symbols.length) {
      const current = symbols[index];
      index += 1;
      if (current) await run(current);
    }
  });
  await Promise.all(workers);
}

export async function ensureMarketReports(supabase: FinanceClient, now = new Date()): Promise<void> {
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

    const stored = await supabase.from("stock_fundamentals").select("symbol,market_report").in("symbol", symbols);
    if (stored.error) {
      console.error(stored.error);
      return;
    }

    const bySymbol = new Map((stored.data ?? []).map((row) => [row.symbol, row.market_report]));
    const clock = now.getTime();
    const stale = symbols.filter((symbol) => {
      const stored = bySymbol.get(symbol) ?? null;
      const report = readMarketReport(stored);
      if (!report || report.version !== 2) return true;
      const age = reportAge(stored, clock);
      if (age == null) return true;
      return age >= (report.lastPrice != null ? FRESH_OK_MS : FRESH_EMPTY_MS);
    });

    await mapPool(stale, 2, async (symbol) => {
      const report = await fetchMarketReport(symbol, now);
      const existing = bySymbol.has(symbol);
      const saved = existing
        ? await supabase.from("stock_fundamentals").update({ market_report: report }).eq("symbol", symbol)
        : await supabase.from("stock_fundamentals").insert({
            user_id: userId,
            symbol,
            source: report.source,
            market_report: report,
          });
      if (saved.error) console.error(saved.error);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[prices] market report ensure failed: ${message}`);
  }
}
