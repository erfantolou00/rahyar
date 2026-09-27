import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPortfolio } from "@/lib/finance/portfolio";
import type {
  Allocation,
  Asset,
  Json,
  PortfolioSnapshot,
  Price,
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
