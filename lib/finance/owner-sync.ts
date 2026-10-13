import { deviationsForSnapshot, syncAllocationDeviationAlerts } from "@/lib/finance/allocation-alerts";
import { buildPortfolio } from "@/lib/finance/portfolio";
import { loadLatestPrices, readRows, type FinanceClient, type LoadResult } from "@/lib/finance/queries";
import type { AllocationDeviation } from "@/lib/finance/allocation-deviation";
import type { Allocation, Asset } from "@/lib/finance/types";

/** Stores allocation deviations from prices already in the database, then delivers due notices. */
export async function syncOwnerDeviations(
  supabase: FinanceClient,
  userId: string,
  now = new Date(),
): Promise<LoadResult<AllocationDeviation[]>> {
  const [assets, allocations] = await Promise.all([
    readRows<Asset>(supabase.from("assets").select("*").eq("user_id", userId)),
    readRows<Allocation>(supabase.from("allocations").select("*").eq("user_id", userId)),
  ]);
  const failed = [assets, allocations].find((result) => !result.ok);
  if (failed && !failed.ok) return failed;
  if (!assets.ok || !allocations.ok) return { ok: false, missingSchema: false };

  const prices = await loadLatestPrices(supabase, assets.data, userId);
  if (!prices.ok) return prices;

  const snapshot = buildPortfolio(assets.data, prices.data, allocations.data);
  return syncAllocationDeviationAlerts(
    supabase,
    userId,
    deviationsForSnapshot(snapshot, allocations.data, now),
  );
}
