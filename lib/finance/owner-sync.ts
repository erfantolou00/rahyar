import { deviationsForSnapshot, syncAllocationDeviationAlerts } from "@/lib/finance/allocation-alerts";
import { loadBook, type FinanceClient, type LoadResult } from "@/lib/finance/queries";
import type { AllocationDeviation } from "@/lib/finance/allocation-deviation";

/** Stores allocation deviations from the book, then delivers due notices. */
export async function syncOwnerDeviations(
  supabase: FinanceClient,
  userId: string,
  now = new Date(),
): Promise<LoadResult<AllocationDeviation[]>> {
  const book = await loadBook(supabase, userId);
  if (!book.ok) return book;

  return syncAllocationDeviationAlerts(
    supabase,
    userId,
    deviationsForSnapshot(book.data.snapshot, book.data.allocations, now),
  );
}
