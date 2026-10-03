import { toNumber } from "@/lib/finance/format";
import { readMarketReport } from "@/lib/finance/prices/market-report";
import { loadPortfolio, readRows, type FinanceClient, type LoadResult } from "@/lib/finance/queries";
import type { Alert, Numeric, StockFundamentals } from "@/lib/finance/types";
import { parseWeeklyContent } from "@/lib/finance/weekly";
import type { ChatFacts, ChatStockFact } from "@/lib/ai/prompt";

function finite(value: Numeric | null | undefined): number | null {
  if (value == null || value === "") return null;
  const number = toNumber(value);
  return Number.isFinite(number) ? number : null;
}

function stockFacts(rows: StockFundamentals[], holdings: ChatFacts["portfolio"]["holdings"]): ChatStockFact[] {
  const prices = new Map(holdings.filter((holding) => holding.type === "stock").map((holding) => [holding.symbol.trim(), holding.price]));
  return rows.flatMap((row) => {
    const symbol = row.symbol.trim();
    if (!prices.has(symbol)) return [];
    const report = readMarketReport(row.market_report);
    return [{
      symbol,
      price: prices.get(symbol) ?? null,
      pe: finite(row.pe),
      eps: finite(row.eps),
      roe: finite(row.roe),
      profitMargin: finite(row.profit_margin),
      adjusted: row.adjusted,
      latestTitle: row.latest_title,
      lastPrice: report?.lastPrice ?? null,
      dailyChange: report?.dailyChange ?? null,
      dailyPercent: report?.dailyPercent ?? null,
      monthPercent: report?.monthPercent ?? null,
      quarterPercent: report?.quarterPercent ?? null,
      yearPercent: report?.yearPercent ?? null,
      volume: report?.volume ?? null,
      tradeValue: report?.tradeValue ?? null,
      marketCap: report?.marketCap ?? null,
      freeFloatPercent: report?.freeFloatPercent ?? null,
      pb: report?.pb ?? null,
      dps: report?.dps ?? null,
      industry: report?.industry ?? null,
    }];
  });
}

export async function loadChatFacts(supabase: FinanceClient, userId: string): Promise<LoadResult<ChatFacts>> {
  const [portfolio, alerts, reports, fundamentals] = await Promise.all([
    loadPortfolio(supabase),
    readRows<Alert>(supabase.from("alerts").select("*").eq("user_id", userId).eq("is_active", true)),
    readRows<{ content: unknown }>(
      supabase
        .from("reports")
        .select("content")
        .eq("user_id", userId)
        .eq("type", "weekly")
        .order("created_at", { ascending: false })
        .limit(1),
    ),
    readRows<StockFundamentals>(supabase.from("stock_fundamentals").select("*")),
  ]);

  if (!portfolio.ok) return portfolio;
  if (!alerts.ok) return alerts;
  if (!reports.ok) return reports;
  if (!fundamentals.ok && !fundamentals.missingSchema) return fundamentals;

  const active = alerts.data;
  return {
    ok: true,
    data: {
      portfolio: {
        totalValue: portfolio.data.totalValue,
        holdings: portfolio.data.holdings.map((holding) => ({
          id: holding.id,
          type: holding.type,
          symbol: holding.symbol,
          quantity: holding.quantity,
          price: holding.price,
          value: holding.value,
          weight: holding.weight,
        })),
        byType: portfolio.data.byType.map((row) => ({
          type: row.type,
          value: row.value,
          weight: row.weight,
          minPercent: row.minPercent,
          maxPercent: row.maxPercent,
          status: row.status,
        })),
      },
      activeAlertCount: active.length,
      activeAlerts: active.slice(0, 30).map((alert) => ({
        id: alert.id,
        kind: alert.kind,
        rule: alert.rule,
        message: alert.message,
        assetType: alert.asset_type,
        threshold: toNumber(alert.threshold),
        createdAt: alert.created_at,
        isActive: alert.is_active,
      })),
      latestWeeklyReport: reports.data[0] ? parseWeeklyContent(reports.data[0].content) : null,
      stocks: fundamentals.ok ? stockFacts(fundamentals.data, portfolio.data.holdings) : [],
    },
  };
}
