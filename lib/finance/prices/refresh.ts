import type { FinanceClient } from "@/lib/finance/queries";
import { fetchMarketQuotes, type MarketQuote } from "@/lib/finance/prices/quotes";

export type RefreshReport = {
  stored: string[];
  missed: string[];
};

export async function refreshAllPrices(writer: FinanceClient): Promise<RefreshReport> {
  const quotes = await fetchMarketQuotes();
  return storeQuotes(quotes, writer);
}

export async function storeQuotes(quotes: MarketQuote[], writer: FinanceClient): Promise<RefreshReport> {
  const stored: string[] = [];
  const fetched = new Set(quotes.map((quote) => quote.symbol));
  const missed = (["USD", "GOLD18", "BTC"] as const).filter((symbol) => !fetched.has(symbol));

  for (const quote of quotes) {
    try {
      const saved = await insertQuote(writer, quote);
      if (saved) stored.push(quote.symbol);
      else missed.push(quote.symbol);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[prices] store ${quote.symbol} failed: ${message}`);
      missed.push(quote.symbol);
    }
  }

  return { stored, missed: [...missed] };
}

async function insertQuote(writer: FinanceClient, quote: MarketQuote): Promise<boolean> {
  const { error } = await writer.from("prices").insert({
    asset_type: quote.assetType,
    symbol: quote.symbol,
    price: quote.price,
    source: quote.source,
    timestamp: quote.fetchedAt,
  });
  if (error) {
    console.error(`[prices] insert ${quote.symbol} failed: ${error.message}`);
    return false;
  }
  return true;
}
