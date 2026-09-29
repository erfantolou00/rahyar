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
    if (!fresh || btcStillInRial || (btc != null && !btcFromTether)) await refreshAllPrices(supabase);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[prices] ensure failed: ${message}`);
  }
}
