import type { FinanceClient } from "@/lib/finance/queries";
import { canonicalFeed, isLiveSymbol, liveSymbolLabels, type LiveSymbol } from "@/lib/finance/prices/match";
import { codalAvailableFor, resolvePriceFeeds, type PriceFeed, type StoredPriceFeed } from "@/lib/finance/prices/feeds";
import type { AssetType } from "@/lib/finance/types";

export type FeedMutation =
  | { ok: true; note: string | null }
  | { ok: false; error: "invalid" | "unsupported" | "save" | "schema" };

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "42703" ||
    /schema cache|does not exist|could not find the/i.test(error.message ?? "")
  );
}

export async function loadPriceFeeds(
  supabase: FinanceClient,
  userId: string,
): Promise<{ feeds: PriceFeed[]; missingSchema: boolean }> {
  const [assets, stored] = await Promise.all([
    supabase.from("assets").select("type,symbol").eq("user_id", userId).in("type", ["stock", "fund"]),
    supabase
      .from("price_feeds")
      .select("asset_type,symbol,price_enabled,codal_enabled,added")
      .eq("user_id", userId),
  ]);

  if (assets.error) console.error(`[prices] holdings for feeds failed: ${assets.error.message}`);
  const missingSchema = Boolean(stored.error && isMissingSchema(stored.error));
  if (stored.error && !missingSchema) console.error(`[prices] price_feeds read failed: ${stored.error.message}`);

  const holdings = (assets.data ?? []).map((row) => ({ type: row.type, symbol: row.symbol }));
  const rows: StoredPriceFeed[] = (stored.data ?? []).map((row) => ({
    assetType: row.asset_type,
    symbol: row.symbol,
    priceEnabled: row.price_enabled,
    codalEnabled: row.codal_enabled,
    added: row.added,
  }));

  return { feeds: resolvePriceFeeds(holdings, missingSchema ? [] : rows), missingSchema };
}

async function readStored(
  supabase: FinanceClient,
  userId: string,
  assetType: AssetType,
  symbol: string,
): Promise<{ ok: true; found: boolean; added: boolean; codalEnabled: boolean } | { ok: false; error: "save" | "schema" }> {
  const existing = await supabase
    .from("price_feeds")
    .select("added,codal_enabled")
    .eq("user_id", userId)
    .eq("asset_type", assetType)
    .eq("symbol", symbol)
    .maybeSingle();
  if (existing.error) {
    if (isMissingSchema(existing.error)) return { ok: false, error: "schema" };
    console.error(existing.error);
    return { ok: false, error: "save" };
  }
  return {
    ok: true,
    found: existing.data != null,
    added: existing.data?.added ?? false,
    codalEnabled: existing.data?.codal_enabled ?? false,
  };
}

export async function savePriceFeedFlags(
  supabase: FinanceClient,
  userId: string,
  input: { assetType: AssetType; symbol: string; priceEnabled: boolean; codalEnabled: boolean },
): Promise<FeedMutation> {
  const series = canonicalFeed(input.assetType, input.symbol);
  if (!series) return { ok: false, error: "invalid" };
  const existing = await readStored(supabase, userId, series.assetType, series.symbol);
  if (!existing.ok) return existing;

  const saved = await supabase.from("price_feeds").upsert(
    {
      user_id: userId,
      asset_type: series.assetType,
      symbol: series.symbol,
      price_enabled: input.priceEnabled,
      codal_enabled: codalAvailableFor(series.assetType) && input.codalEnabled,
      added: existing.added,
    },
    { onConflict: "user_id,asset_type,symbol" },
  );
  if (saved.error) {
    if (isMissingSchema(saved.error)) return { ok: false, error: "schema" };
    console.error(saved.error);
    return { ok: false, error: "save" };
  }
  return { ok: true, note: null };
}

export async function addPriceFeed(
  supabase: FinanceClient,
  userId: string,
  input: { assetType: AssetType; symbol: string },
): Promise<FeedMutation> {
  const series = canonicalFeed(input.assetType, input.symbol);
  if (!series) return { ok: false, error: "invalid" };
  const market = isLiveSymbol(series.symbol);
  const listed = series.assetType === "stock" || series.assetType === "fund";
  if (!market && !listed) return { ok: false, error: "unsupported" };

  const existing = await readStored(supabase, userId, series.assetType, series.symbol);
  if (!existing.ok) return existing;

  const saved = await supabase.from("price_feeds").upsert(
    {
      user_id: userId,
      asset_type: series.assetType,
      symbol: series.symbol,
      price_enabled: true,
      codal_enabled: listed ? (existing.found ? existing.codalEnabled : series.assetType === "stock") : false,
      added: market ? existing.added : true,
    },
    { onConflict: "user_id,asset_type,symbol" },
  );
  if (saved.error) {
    if (isMissingSchema(saved.error)) return { ok: false, error: "schema" };
    console.error(saved.error);
    return { ok: false, error: "save" };
  }

  if (market) {
    return { ok: true, note: `${liveSymbolLabels[series.symbol as LiveSymbol]} از قبل در فهرست است و دریافت قیمتش روشن شد.` };
  }
  return { ok: true, note: null };
}

export async function removePriceFeed(
  supabase: FinanceClient,
  userId: string,
  input: { assetType: AssetType; symbol: string },
): Promise<FeedMutation> {
  const series = canonicalFeed(input.assetType, input.symbol);
  if (!series) return { ok: false, error: "invalid" };
  const loaded = await loadPriceFeeds(supabase, userId);
  if (loaded.missingSchema) return { ok: false, error: "schema" };
  const feed = loaded.feeds.find((item) => item.assetType === series.assetType && item.symbol === series.symbol);
  if (!feed?.removable) return { ok: false, error: "invalid" };

  const deleted = await supabase
    .from("price_feeds")
    .delete()
    .eq("user_id", userId)
    .eq("asset_type", series.assetType)
    .eq("symbol", series.symbol);
  if (deleted.error) {
    if (isMissingSchema(deleted.error)) return { ok: false, error: "schema" };
    console.error(deleted.error);
    return { ok: false, error: "save" };
  }
  return { ok: true, note: null };
}
