import type { FinanceClient } from "@/lib/finance/queries";
import { fetchListedQuote } from "@/lib/finance/prices/listed";
import { normalizeSymbol } from "@/lib/finance/prices/match";
import { fetchMarketQuotes, type MarketQuote } from "@/lib/finance/prices/quotes";
import { isListedSession } from "@/lib/finance/prices/session";

export type RefreshReport = {
  stored: string[];
  missed: string[];
};

export async function refreshAllPrices(writer: FinanceClient, userId: string, now = new Date()): Promise<RefreshReport> {
  const listedPromise = isListedSession(now)
    ? refreshHeldListedPrices(writer, userId)
    : Promise.resolve({ stored: [] as string[], missed: [] as string[] });
  const [quotes, listed] = await Promise.all([fetchMarketQuotes(), listedPromise]);
  const market = await storeQuotes(quotes, writer, userId);
  return {
    stored: [...market.stored, ...listed.stored],
    missed: [...market.missed, ...listed.missed],
  };
}

async function refreshHeldListedPrices(writer: FinanceClient, userId: string): Promise<RefreshReport> {
  const assets = await writer.from("assets").select("type,symbol").eq("user_id", userId).in("type", ["stock", "fund"]);
  if (assets.error) {
    console.error(`[prices] listed assets failed: ${assets.error.message}`);
    return { stored: [], missed: [] };
  }

  const holdings = (assets.data ?? []).filter((row) => row.symbol.trim());
  const symbols = [...new Set(holdings.map((row) => row.symbol.trim()))];
  const quotes = new Map<string, { price: number; source: string }>();
  await Promise.all(
    symbols.map(async (symbol) => {
      const quote = await fetchListedQuote(symbol);
      if (quote) quotes.set(normalizeSymbol(symbol), { price: quote.price, source: quote.source });
    }),
  );

  const stored: string[] = [];
  const missed: string[] = [];
  const seen = new Set<string>();
  for (const asset of holdings) {
    const key = `${asset.type}:${asset.symbol.trim().toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const quote = quotes.get(normalizeSymbol(asset.symbol));
    if (!quote) {
      missed.push(asset.symbol.trim());
      continue;
    }
    const { error } = await writer.from("prices").insert({
      user_id: userId,
      asset_type: asset.type,
      symbol: asset.symbol.trim(),
      price: quote.price,
      source: quote.source,
      timestamp: new Date().toISOString(),
    });
    if (error) {
      console.error(`[prices] insert ${asset.symbol} failed: ${error.message}`);
      missed.push(asset.symbol.trim());
      continue;
    }
    stored.push(asset.symbol.trim());
  }
  return { stored, missed };
}

export async function storeQuotes(quotes: MarketQuote[], writer: FinanceClient, userId: string): Promise<RefreshReport> {
  const stored: string[] = [];
  const fetched = new Set(quotes.map((quote) => quote.symbol));
  const missed = (["USD", "GOLD18", "BTC"] as const).filter((symbol) => !fetched.has(symbol));

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
