import { toNumber } from "@/lib/finance/format";
import type { FinanceClient } from "@/lib/finance/queries";
import { isBtcQuotedInRial } from "@/lib/finance/prices/btc";
import { liveSymbols } from "@/lib/finance/prices/match";
import { refreshAllPrices } from "@/lib/finance/prices/refresh";
import { isListedSession } from "@/lib/finance/prices/session";

const FRESH_FOR_MS = 15 * 60 * 1000;

export async function ensureLivePrices(
  supabase: FinanceClient,
  userId: string,
  now = new Date(),
): Promise<{ refreshed: boolean }> {
  try {
    const latest = await Promise.all(
      liveSymbols.map((symbol) =>
        supabase
          .from("prices")
          .select("symbol,timestamp,price,source")
          .eq("user_id", userId)
          .eq("symbol", symbol)
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ),
    );
    const failed = latest.find((row) => row.error);
    if (failed?.error) {
      console.error(`[prices] read failed: ${failed.error.message}`);
      return { refreshed: false };
    }

    const newest = new Map<string, { timestamp: string; price: number; source: string }>();
    for (const row of latest) {
      if (!row.data) continue;
      newest.set(row.data.symbol, {
        timestamp: row.data.timestamp,
        price: toNumber(row.data.price),
        source: row.data.source,
      });
    }
    const fresh = liveSymbols.every((symbol) => {
      const stamp = newest.get(symbol)?.timestamp;
      return stamp != null && now.getTime() - new Date(stamp).getTime() < FRESH_FOR_MS;
    });
    const btc = newest.get("BTC");
    const btcStillInRial = btc != null && isBtcQuotedInRial(btc.price);
    const btcFromTether = btc != null && /^(nobitex|binance|coingecko):/.test(btc.source);
    const listedStale = isListedSession(now) ? await heldListedPricesStale(supabase, userId, now) : false;
    const shouldRefresh = !fresh || btcStillInRial || (btc != null && !btcFromTether) || listedStale;
    if (!shouldRefresh) return { refreshed: false };
    const report = await refreshAllPrices(supabase, userId, now);
    return { refreshed: report.stored.length > 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[prices] ensure failed: ${message}`);
    return { refreshed: false };
  }
}

async function heldListedPricesStale(supabase: FinanceClient, userId: string, now: Date): Promise<boolean> {
  const assets = await supabase.from("assets").select("type,symbol").eq("user_id", userId).in("type", ["stock", "fund"]);
  if (assets.error) {
    console.error(`[prices] listed read failed: ${assets.error.message}`);
    return false;
  }
  const seen = new Set<string>();
  const holdings = (assets.data ?? []).filter((row) => {
    const symbol = row.symbol.trim();
    if (!symbol) return false;
    const key = `${row.type}:${symbol.toUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (holdings.length === 0) return false;

  const newest = await Promise.all(
    holdings.map((asset) =>
      supabase
        .from("prices")
        .select("timestamp")
        .eq("user_id", userId)
        .eq("asset_type", asset.type)
        .eq("symbol", asset.symbol.trim())
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  if (newest.some((row) => row.error)) {
    const failed = newest.find((row) => row.error);
    console.error(`[prices] listed prices failed: ${failed?.error?.message ?? "unknown"}`);
    return false;
  }

  return newest.some((row) => {
    const stamp = row.data?.timestamp;
    return stamp == null || now.getTime() - new Date(stamp).getTime() >= FRESH_FOR_MS;
  });
}
