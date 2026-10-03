import type { SupabaseClient } from "@supabase/supabase-js";
import { effectiveAllocationClass } from "@/lib/finance/allocation-class";
import { toNumber } from "@/lib/finance/format";
import { instrumentForAsset, latestQuote } from "@/lib/finance/prices/match";
import { amountInRial, quoteInUnit, type PriceUnit } from "@/lib/finance/prices/unit";
import { buildBasket, buildPortfolio, latestPrices } from "@/lib/finance/portfolio";
import type {
  Allocation,
  Asset,
  Json,
  PortfolioSnapshot,
  Price,
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

export async function loadPortfolio(
  supabase: FinanceClient,
): Promise<LoadResult<PortfolioSnapshot>> {
  const [assets, prices, allocations] = await Promise.all([
    readRows<Asset>(supabase.from("assets").select("*")),
    readRows<Price>(supabase.from("prices").select("*").order("timestamp", { ascending: false })),
    readRows<Allocation>(
      supabase.from("allocations").select("*").order("valid_from", { ascending: false }),
    ),
  ]);

  const firstFailure = [assets, prices, allocations].find((result) => !result.ok);
  if (firstFailure && !firstFailure.ok) return firstFailure;

  if (!assets.ok || !prices.ok || !allocations.ok) {
    return { ok: false, missingSchema: false };
  }

  return {
    ok: true,
    data: buildPortfolio(assets.data, prices.data, allocations.data),
  };
}

export async function loadBasket(
  supabase: FinanceClient,
): Promise<LoadResult<ReturnType<typeof buildBasket>>> {
  const [assets, prices] = await Promise.all([
    readRows<Asset>(supabase.from("assets").select("*").order("symbol", { ascending: true })),
    readRows<Price>(supabase.from("prices").select("*").order("timestamp", { ascending: false })),
  ]);
  if (!assets.ok) return assets;
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

export async function loadStockFundamentals(
  supabase: FinanceClient,
): Promise<LoadResult<StockFundamentals[]>> {
  return readRows<StockFundamentals>(
    supabase.from("stock_fundamentals").select("*").order("symbol", { ascending: true }),
  );
}

export async function loadLivePrices(supabase: FinanceClient): Promise<Price[]> {
  const prices = await readRows<Price>(
    supabase
      .from("prices")
      .select("*")
      .in("symbol", ["USD", "GOLD18", "BTC"])
      .order("timestamp", { ascending: false }),
  );
  return prices.ok ? prices.data : [];
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
