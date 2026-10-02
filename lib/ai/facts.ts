import { toNumber } from "@/lib/finance/format";
import { loadPortfolio, readRows, type FinanceClient, type LoadResult } from "@/lib/finance/queries";
import type { Alert } from "@/lib/finance/types";
import { parseWeeklyContent } from "@/lib/finance/weekly";
import type { ChatFacts } from "@/lib/ai/prompt";

export async function loadChatFacts(supabase: FinanceClient, userId: string): Promise<LoadResult<ChatFacts>> {
  const [portfolio, alerts, reports] = await Promise.all([
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
  ]);

  if (!portfolio.ok) return portfolio;
  if (!alerts.ok) return alerts;
  if (!reports.ok) return reports;

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
    },
  };
}
