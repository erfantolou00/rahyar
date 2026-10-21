import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveAllocationClass } from "@/lib/finance/allocation-class";
import { toNumber } from "@/lib/finance/format";
import { instrumentForAsset, latestQuote, liveSymbols } from "@/lib/finance/prices/match";
import { amountInRial, quoteInUnit, type PriceUnit } from "@/lib/finance/prices/unit";
import { buildBasket, buildPortfolio, latestPrices } from "@/lib/finance/portfolio";
import type {
  Allocation,
  Asset,
  Json,
  PortfolioSnapshot,
  Price,
  LedgerAccount,
  LedgerPosition,
  StockFundamentals,
} from "@/lib/finance/types";
import type { Database } from "@/lib/supabase/database.types";

export type FinanceClient = SupabaseClient<Database>;

export type LoadResult<T> =
  | { ok: true; data: T }
  | { ok: false; missingSchema: boolean };

function missingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    /schema cache|does not exist|could not find the table/i.test(error.message ?? "")
  );
}

export async function readRows<T>(
  query: PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
): Promise<LoadResult<T[]>> {
  const { data, error } = await query;
  if (error) {
    console.error(error);
    return { ok: false, missingSchema: missingSchema(error) };
  }
  return { ok: true, data: data ?? [] };
}

export type Book = {
  assets: Asset[];
  allocations: Allocation[];
  prices: Price[];
  snapshot: PortfolioSnapshot;
};

export async function loadLatestPrices(
  supabase: FinanceClient,
  assets: Pick<Asset, "type" | "symbol">[],
  userId?: string,
): Promise<LoadResult<Price[]>> {
  let view = supabase.from("latest_prices").select("*");
  if (userId) view = view.eq("user_id", userId);
  const latest = await readRows<Price>(view);
  if (latest.ok || !latest.missingSchema) return latest;
  return loadLatestPricesBySymbol(supabase, assets, userId);
}

async function loadLatestPricesBySymbol(
  supabase: FinanceClient,
  assets: Pick<Asset, "type" | "symbol">[],
  userId?: string,
): Promise<LoadResult<Price[]>> {
  const assetKeys = new Map<string, { type: Asset["type"]; symbol: string }>();
  for (const asset of assets) {
    const symbol = asset.symbol.trim();
    if (!symbol) continue;
    assetKeys.set(`${asset.type}:${symbol.toUpperCase()}`, { type: asset.type, symbol });
  }

  const [assetResults, liveResults] = await Promise.all([
    Promise.all(
      [...assetKeys.values()].map((key) => {
        let query = supabase
          .from("prices")
          .select("*")
          .eq("asset_type", key.type)
          .eq("symbol", key.symbol);
        if (userId) query = query.eq("user_id", userId);
        return query.order("timestamp", { ascending: false }).limit(1).maybeSingle();
      }),
    ),
    Promise.all(
      liveSymbols.map((symbol) => {
        let query = supabase.from("prices").select("*").eq("symbol", symbol);
        if (userId) query = query.eq("user_id", userId);
        return query.order("timestamp", { ascending: false }).limit(1).maybeSingle();
      }),
    ),
  ]);

  const failed = [...assetResults, ...liveResults].find((result) => result.error);
  if (failed?.error) {
    console.error(failed.error);
    return { ok: false, missingSchema: missingSchema(failed.error) };
  }

  const byId = new Map<string, Price>();
  for (const result of [...assetResults, ...liveResults]) {
    if (result.data) byId.set(result.data.id, result.data);
  }
  return { ok: true, data: [...byId.values()] };
}

export async function loadBook(supabase: FinanceClient, userId?: string): Promise<LoadResult<Book>> {
  let assetsQuery = supabase.from("assets").select("*");
  let allocationsQuery = supabase.from("allocations").select("*").order("valid_from", { ascending: false });
  if (userId) {
    assetsQuery = assetsQuery.eq("user_id", userId);
    allocationsQuery = allocationsQuery.eq("user_id", userId);
  }

  const [assets, allocations] = await Promise.all([
    readRows<Asset>(assetsQuery),
    readRows<Allocation>(allocationsQuery),
  ]);
  const failed = [assets, allocations].find((result) => !result.ok);
  if (failed && !failed.ok) return failed;
  if (!assets.ok || !allocations.ok) return { ok: false, missingSchema: false };

  const prices = await loadLatestPrices(supabase, assets.data, userId);
  if (!prices.ok) return prices;

  return {
    ok: true,
    data: {
      assets: assets.data,
      allocations: allocations.data,
      prices: prices.data,
      snapshot: buildPortfolio(assets.data, prices.data, allocations.data),
    },
  };
}

export async function loadPortfolio(
  supabase: FinanceClient,
): Promise<LoadResult<PortfolioSnapshot>> {
  const book = await loadBook(supabase);
  if (!book.ok) return book;
  return { ok: true, data: book.data.snapshot };
}

export async function loadBasket(
  supabase: FinanceClient,
): Promise<LoadResult<ReturnType<typeof buildBasket>>> {
  const assets = await readRows<Asset>(supabase.from("assets").select("*").order("symbol", { ascending: true }));
  if (!assets.ok) return assets;
  const prices = await loadLatestPrices(supabase, assets.data);
  const priceRows = prices.ok ? prices.data : [];
  const quotes = latestPrices(priceRows);
  const usd = latestQuote(priceRows, "USD");
  const usdRial = usd ? toNumber(usd.price) : null;

  return {
    ok: true,
    data: buildBasket(
      assets.data.map((asset) => {
        const instrument = instrumentForAsset(asset.type, asset.symbol);
        const unit: PriceUnit = asset.price_unit === "usd" ? "usd" : "rial";
        const direct = quotes.get(`${asset.type}:${asset.symbol.trim().toUpperCase()}`) ?? null;
        const live = direct == null && instrument ? latestQuote(priceRows, instrument) : null;
        const manual = asset.manual_value == null ? null : toNumber(asset.manual_value);
        const directDisplay = direct ? listedInUnit(toNumber(direct.price), unit, usdRial) : null;
        const liveDisplay =
          directDisplay ??
          (live && instrument ? quoteInUnit(instrument, toNumber(live.price), unit, usdRial) : null);
        const exchange = asset.type === "stock" || asset.type === "fund";
        const useLive = exchange ? liveDisplay != null : manual == null && liveDisplay != null;
        const displayCurrent = useLive ? liveDisplay : manual ?? liveDisplay;
        const displayBuy = asset.avg_buy_price == null ? null : toNumber(asset.avg_buy_price);
        return {
          id: asset.id,
          name: asset.symbol,
          type: asset.type,
          quantity: toNumber(asset.quantity),
          priceUnit: unit,
          displayAvgBuyPrice: displayBuy,
          displayCurrentPrice: displayCurrent,
          manualPrice: manual,
          avgBuyPrice: amountInRial(displayBuy, unit, usdRial),
          currentPrice: amountInRial(displayCurrent, unit, usdRial),
          quotedAt: useLive ? direct?.timestamp ?? live?.timestamp ?? null : null,
          priceOrigin: useLive ? "live" : manual != null ? "manual" : "none",
          allocationClass: effectiveAllocationClass(asset),
          allocationClassSource: asset.allocation_class_source === "manual" ? "manual" : "auto",
          acquiredOn: asset.acquired_on,
        };
      }),
    ),
  };
}

function listedInUnit(priceRial: number, unit: PriceUnit, usdRial: number | null): number | null {
  if (!(priceRial > 0)) return null;
  if (unit === "rial") return priceRial;
  if (usdRial == null || !(usdRial > 0)) return null;
  return priceRial / usdRial;
}

export async function loadLedger(supabase: FinanceClient): Promise<{
  ready: boolean;
  accounts: LedgerAccount[];
  positions: Pick<LedgerPosition, "account_id" | "asset_id" | "quantity">[];
}> {
  const accounts = await supabase.from("accounts").select("*").order("name", { ascending: true });
  if (accounts.error) {
    if (!missingSchema(accounts.error)) console.error(accounts.error);
    return { ready: false, accounts: [], positions: [] };
  }
  const positions = await supabase.from("positions").select("account_id,asset_id,quantity").gt("quantity", 0);
  if (positions.error) {
    console.error(positions.error);
    return { ready: true, accounts: accounts.data ?? [], positions: [] };
  }
  return { ready: true, accounts: accounts.data ?? [], positions: positions.data ?? [] };
}

export async function loadStockFundamentals(
  supabase: FinanceClient,
): Promise<LoadResult<StockFundamentals[]>> {
  return readRows<StockFundamentals>(
    supabase.from("stock_fundamentals").select("*").order("symbol", { ascending: true }),
  );
}

export async function loadStockHistory(
  supabase: FinanceClient,
  symbols: string[],
): Promise<LoadResult<{
  periods: { symbol: string; period: string; kind: "interim" | "annual"; tracing_no: string; revision_of: string | null }[];
  months: { symbol: string; period: string; sales_value: StockFundamentals["pe"] }[];
}>> {
  if (symbols.length === 0) return { ok: true, data: { periods: [], months: [] } };
  const periods = await supabase
    .from("stock_periods")
    .select("symbol, period, kind, tracing_no, revision_of")
    .in("symbol", symbols)
    .order("period", { ascending: false });
  if (periods.error) {
    console.error(periods.error);
    return { ok: false, missingSchema: missingSchema(periods.error) };
  }
  const months = await supabase
    .from("stock_monthly")
    .select("symbol, period, sales_value")
    .in("symbol", symbols)
    .order("period", { ascending: false });
  if (months.error) {
    console.error(months.error);
    return { ok: false, missingSchema: missingSchema(months.error) };
  }
  return {
    ok: true,
    data: {
      periods: (periods.data ?? []).flatMap((row) => (
        row.kind === "interim" || row.kind === "annual"
          ? [{ symbol: row.symbol, period: row.period, kind: row.kind, tracing_no: row.tracing_no, revision_of: row.revision_of }]
          : []
      )),
      months: months.data ?? [],
    },
  };
}

export async function loadLivePrices(supabase: FinanceClient): Promise<Price[]> {
  const results = await Promise.all(
    liveSymbols.map((symbol) =>
      supabase
        .from("prices")
        .select("*")
        .eq("symbol", symbol)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  return results.flatMap((result) => (result.error || !result.data ? [] : [result.data]));
}

export function snapshotJson(snapshot: PortfolioSnapshot): Json {
  return {
    captured_at: new Date().toISOString(),
    total_value: snapshot.totalValue,
    holdings: snapshot.holdings.map((holding) => ({
      id: holding.id,
      type: holding.type,
      symbol: holding.symbol,
      quantity: holding.quantity,
      price: holding.price,
      used_cost_basis: holding.usedCostBasis,
      value: holding.value,
      weight: holding.weight,
    })),
    by_type: snapshot.byType.map((row) => ({
      type: row.type,
      value: row.value,
      weight: row.weight,
      min_percent: row.minPercent,
      max_percent: row.maxPercent,
      status: row.status,
    })),
  };
}
