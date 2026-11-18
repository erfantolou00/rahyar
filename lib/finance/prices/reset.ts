import type { FinanceClient } from "@/lib/finance/queries";

/** Keeps the newest quote of each symbol and drops the older ticks. */
export async function resetPriceHistory(supabase: FinanceClient, userId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("reset_price_history", { p_user_id: userId });
  if (error) {
    console.error(error);
    return null;
  }
  return typeof data === "number" ? data : null;
}
