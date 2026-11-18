import { toNumber } from "@/lib/finance/format";
import type { FinanceClient } from "@/lib/finance/queries";
import { isBtcQuotedInRial } from "@/lib/finance/prices/btc";
import { loadPriceFeeds } from "@/lib/finance/prices/feed-store";
import type { PriceFeed } from "@/lib/finance/prices/feeds";
import { isLiveSymbol } from "@/lib/finance/prices/match";
import { refreshAllPrices } from "@/lib/finance/prices/refresh";
import { isListedSession } from "@/lib/finance/prices/session";

const FRESH_FOR_MS = 15 * 60 * 1000;

export async function ensureLivePrices(
  supabase: FinanceClient,
  userId: string,
  now = new Date(),
): Promise<{ refreshed: boolean }> {
  try {
    const { feeds } = await loadPriceFeeds(supabase, userId);
    const market = feeds.filter((feed) => feed.priceEnabled && isLiveSymbol(feed.symbol));
    const listed = feeds.filter((feed) => feed.priceEnabled && !isLiveSymbol(feed.symbol));
    const symbols = market.map((feed) => feed.symbol);
    if (symbols.length === 0 && listed.length === 0) return { refreshed: false };

    const latest = await Promise.all(
      symbols.map((symbol) =>
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
    const fresh = symbols.every((symbol) => {
      const stamp = newest.get(symbol)?.timestamp;
      return stamp != null && now.getTime() - new Date(stamp).getTime() < FRESH_FOR_MS;
    });
    const btc = symbols.includes("BTC") ? newest.get("BTC") : undefined;
    const btcStillInRial = btc != null && isBtcQuotedInRial(btc.price);
    const btcFromTether = btc != null && /^(nobitex|binance|coingecko):/.test(btc.source);
    const listedStale = isListedSession(now) ? await listedPricesStale(supabase, userId, listed, now) : false;
    const marketStale = symbols.length > 0 && (!fresh || btcStillInRial || (btc != null && !btcFromTether));
    if (!marketStale && !listedStale) return { refreshed: false };
    const report = await refreshAllPrices(supabase, userId, now, feeds);
    return { refreshed: report.stored.length > 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[prices] ensure failed: ${message}`);
    return { refreshed: false };
  }
}

async function listedPricesStale(
  supabase: FinanceClient,
  userId: string,
  feeds: PriceFeed[],
  now: Date,
): Promise<boolean> {
  if (feeds.length === 0) return false;
  const newest = await Promise.all(
    feeds.map((feed) =>
      supabase
        .from("prices")
        .select("timestamp")
        .eq("user_id", userId)
        .eq("asset_type", feed.assetType)
        .eq("symbol", feed.symbol)
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
