import type { FinanceClient } from "@/lib/finance/queries";

export async function assetOwnerIds(supabase: FinanceClient): Promise<string[] | null> {
  const owners = await supabase.from("assets").select("user_id");
  if (owners.error) {
    console.error(owners.error);
    return null;
  }
  return [...new Set((owners.data ?? []).map((row) => row.user_id))];
}
