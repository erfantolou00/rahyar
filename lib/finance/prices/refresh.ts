import type { FinanceClient } from "@/lib/finance/queries";
import { loadPriceFeeds } from "@/lib/finance/prices/feed-store";
import type { PriceFeed } from "@/lib/finance/prices/feeds";
import { fetchListedQuote } from "@/lib/finance/prices/listed";
import { isLiveSymbol, liveSymbols, normalizeSymbol, type LiveSymbol } from "@/lib/finance/prices/match";
import { fetchMarketQuotes, type MarketQuote } from "@/lib/finance/prices/quotes";
import { isListedSession } from "@/lib/finance/prices/session";

export type RefreshReport = {
  stored: string[];
  missed: string[];
};

export async function refreshAllPrices(
  writer: FinanceClient,
  userId: string,
  now = new Date(),
  feeds?: PriceFeed[],
): Promise<RefreshReport> {
  const resolved = feeds ?? (await loadPriceFeeds(writer, userId)).feeds;
  const priced = resolved.filter((feed) => feed.priceEnabled);
  const marketSymbols = [...new Set(priced.map((feed) => feed.symbol).filter(isLiveSymbol))];
  const listed = priced.filter((feed) => !isLiveSymbol(feed.symbol));
  const listedPromise = isListedSession(now)
    ? refreshListedPrices(writer, userId, listed)
    : Promise.resolve({ stored: [] as string[], missed: [] as string[] });
  const [quotes, listedReport] = await Promise.all([fetchMarketQuotes(marketSymbols), listedPromise]);
  const market = await storeQuotes(quotes, writer, userId, marketSymbols);
  return {
    stored: [...market.stored, ...listedReport.stored],
    missed: [...market.missed, ...listedReport.missed],
  };
}

async function refreshListedPrices(writer: FinanceClient, userId: string, feeds: PriceFeed[]): Promise<RefreshReport> {
  const symbols = [...new Set(feeds.map((feed) => feed.symbol))];
  const quotes = new Map<string, { price: number; source: string }>();
  await Promise.all(
    symbols.map(async (symbol) => {
      const quote = await fetchListedQuote(symbol);
      if (quote) quotes.set(normalizeSymbol(symbol), { price: quote.price, source: quote.source });
    }),
  );

  const stored: string[] = [];
  const missed: string[] = [];
  for (const feed of feeds) {
    const quote = quotes.get(normalizeSymbol(feed.symbol));
    if (!quote) {
      missed.push(feed.symbol);
      continue;
    }
    const { error } = await writer.from("prices").insert({
      user_id: userId,
      asset_type: feed.assetType,
      symbol: feed.symbol,
      price: quote.price,
      source: quote.source,
      timestamp: new Date().toISOString(),
    });
    if (error) {
      console.error(`[prices] insert ${feed.symbol} failed: ${error.message}`);
      missed.push(feed.symbol);
      continue;
    }
    stored.push(feed.symbol);
  }
  return { stored, missed };
}

export async function storeQuotes(
  quotes: MarketQuote[],
  writer: FinanceClient,
  userId: string,
  expected: readonly LiveSymbol[] = liveSymbols,
): Promise<RefreshReport> {
  const stored: string[] = [];
  const fetched = new Set<string>(quotes.map((quote) => quote.symbol));
  const missed = expected.filter((symbol) => !fetched.has(symbol));

  for (const quote of quotes) {
    try {
      const saved = await insertQuote(writer, userId, quote);
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

async function insertQuote(writer: FinanceClient, userId: string, quote: MarketQuote): Promise<boolean> {
  const { error } = await writer.from("prices").insert({
    user_id: userId,
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
