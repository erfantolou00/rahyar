import type { FinanceClient } from "@/lib/finance/queries";
import { liveSymbols } from "@/lib/finance/prices/match";
import { refreshAllPrices } from "@/lib/finance/prices/refresh";

const FRESH_FOR_MS = 15 * 60 * 1000;

export async function ensureLivePrices(supabase: FinanceClient): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("prices")
      .select("symbol,timestamp")
      .in("symbol", [...liveSymbols])
      .order("timestamp", { ascending: false });
    if (error) {
      console.error(`[prices] read failed: ${error.message}`);
      return;
    }

    const newest = new Map<string, string>();
    for (const row of data ?? []) {
      if (!newest.has(row.symbol)) newest.set(row.symbol, row.timestamp);
    }
    const fresh = liveSymbols.every((symbol) => {
      const stamp = newest.get(symbol);
      return stamp != null && Date.now() - new Date(stamp).getTime() < FRESH_FOR_MS;
    });
    if (!fresh) await refreshAllPrices(supabase);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[prices] ensure failed: ${message}`);
  }
}
