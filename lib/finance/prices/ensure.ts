import { toNumber } from "@/lib/finance/format";
import type { FinanceClient } from "@/lib/finance/queries";
import { isBtcQuotedInRial } from "@/lib/finance/prices/btc";
import { liveSymbols } from "@/lib/finance/prices/match";
import { refreshAllPrices } from "@/lib/finance/prices/refresh";

const FRESH_FOR_MS = 15 * 60 * 1000;

export async function ensureLivePrices(supabase: FinanceClient): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("prices")
      .select("symbol,timestamp,price,source")
      .in("symbol", [...liveSymbols])
      .order("timestamp", { ascending: false });
    if (error) {
      console.error(`[prices] read failed: ${error.message}`);
      return;
    }

    const newest = new Map<string, { timestamp: string; price: number; source: string }>();
    for (const row of data ?? []) {
      if (!newest.has(row.symbol)) {
        newest.set(row.symbol, {
          timestamp: row.timestamp,
          price: toNumber(row.price),
          source: row.source,
        });
      }
    }
    const fresh = liveSymbols.every((symbol) => {
      const stamp = newest.get(symbol)?.timestamp;
      return stamp != null && Date.now() - new Date(stamp).getTime() < FRESH_FOR_MS;
    });
    const btc = newest.get("BTC");
    const btcStillInRial = btc != null && isBtcQuotedInRial(btc.price);
    const btcFromTether = btc != null && /^(nobitex|binance|coingecko):/.test(btc.source);
    const listedStale = await heldListedPricesStale(supabase);
    if (!fresh || btcStillInRial || (btc != null && !btcFromTether) || listedStale) await refreshAllPrices(supabase);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[prices] ensure failed: ${message}`);
  }
}

async function heldListedPricesStale(supabase: FinanceClient): Promise<boolean> {
  const assets = await supabase.from("assets").select("type,symbol").in("type", ["stock", "fund"]);
  if (assets.error) {
    console.error(`[prices] listed read failed: ${assets.error.message}`);
    return false;
  }
  const holdings = (assets.data ?? []).filter((row) => row.symbol.trim());
  if (holdings.length === 0) return false;

  const prices = await supabase
    .from("prices")
    .select("asset_type,symbol,timestamp")
    .in("asset_type", ["stock", "fund"])
    .order("timestamp", { ascending: false });
  if (prices.error) {
    console.error(`[prices] listed prices failed: ${prices.error.message}`);
    return false;
  }

  const newest = new Map<string, string>();
  for (const row of prices.data ?? []) {
    const key = `${row.asset_type}:${row.symbol.trim().toUpperCase()}`;
    if (!newest.has(key)) newest.set(key, row.timestamp);
  }

  return holdings.some((asset) => {
    const stamp = newest.get(`${asset.type}:${asset.symbol.trim().toUpperCase()}`);
    return stamp == null || Date.now() - new Date(stamp).getTime() >= FRESH_FOR_MS;
  });
}
