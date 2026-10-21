"use server";

import { revalidatePath } from "next/cache";
import { backfillSymbolHistory, type BackfillResult } from "@/lib/finance/codal/backfill";
import { mapPool } from "@/lib/finance/codal/sync";
import { formatNumber } from "@/lib/finance/format";
import { requireSession } from "@/lib/supabase/auth";

export type RebuildHistoryState = {
  ok: boolean;
  message: string;
  gaps: string[];
};

export async function rebuildFundamentalHistory(
  previous: RebuildHistoryState | null,
  formData: FormData,
): Promise<RebuildHistoryState> {
  void previous;
  void formData;
  const { supabase, userId } = await requireSession();
  const assets = await supabase.from("assets").select("symbol, type").eq("type", "stock");
  if (assets.error) {
    console.error(assets.error);
    return { ok: false, message: "فهرست سهام خوانده نشد.", gaps: [] };
  }
  const symbols = [...new Set((assets.data ?? []).map((row) => row.symbol.trim()).filter(Boolean))];
  if (symbols.length === 0) return { ok: false, message: "سهمی در سبد نیست.", gaps: [] };

  const results: BackfillResult[] = [];
  await mapPool(symbols, 2, async (symbol) => {
    results.push(await backfillSymbolHistory(supabase, userId, symbol, { quarters: 6, months: 12 }));
  });
  revalidatePath("/basket");

  const periods = results.reduce((sum, item) => sum + item.periods, 0);
  const months = results.reduce((sum, item) => sum + item.months, 0);
  const gaps = results.flatMap((item) => item.gaps.map((gap) => `${item.symbol}: ${gap}`));
  const failed = results.some((item) => !item.ok);
  return {
    ok: !failed,
    message: failed
      ? "بازسازی تاریخچه ناتمام ماند."
      : `تاریخچهٔ ${formatNumber(symbols.length)} سهم بازسازی شد: ${formatNumber(periods)} فصل و ${formatNumber(months)} ماه.`,
    gaps,
  };
}
