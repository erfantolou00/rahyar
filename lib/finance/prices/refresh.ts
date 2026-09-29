import type { FinanceClient } from "@/lib/finance/queries";
import { fetchMarketQuotes, type MarketQuote } from "@/lib/finance/prices/quotes";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAllowedEmail } from "@/lib/supabase/env";

export type RefreshReport = {
  stored: string[];
  missed: string[];
};

export async function refreshAllPrices(writer?: FinanceClient): Promise<RefreshReport> {
  const quotes = await fetchMarketQuotes();
  return storeQuotes(quotes, writer);
}

export async function storeQuotes(quotes: MarketQuote[], writer?: FinanceClient): Promise<RefreshReport> {
  const stored: string[] = [];
  const fetched = new Set(quotes.map((quote) => quote.symbol));
  const missed = (["USD", "GOLD18", "BTC"] as const).filter((symbol) => !fetched.has(symbol));

  for (const quote of quotes) {
    try {
      const saved = writer ? await insertWithUser(writer, quote) : await insertWithAdmin(quote);
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

async function insertWithUser(writer: FinanceClient, quote: MarketQuote): Promise<boolean> {
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

async function insertWithAdmin(quote: MarketQuote): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) {
    console.error("[prices] SUPABASE_SECRET_KEY is missing; quote was not stored");
    return false;
  }

  const userId = await singleUserId(admin);
  if (!userId) {
    console.error("[prices] allowed user was not found; quote was not stored");
    return false;
  }

  const { error } = await admin.from("prices").insert({
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

async function singleUserId(admin: NonNullable<ReturnType<typeof createAdminClient>>): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 20 });
  if (error) {
    console.error(`[prices] list users failed: ${error.message}`);
    return null;
  }
  const user = data.users.find((item) => isAllowedEmail(item.email));
  return user?.id ?? null;
}
