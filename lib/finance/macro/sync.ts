import type { FinanceClient } from "@/lib/finance/queries";
import { fetchFredSeries, fredSeries, macroIndicators, type MacroIndicator } from "@/lib/finance/macro/fred";

export type MacroSyncResult =
  | { ok: true; stored: number }
  | { ok: false; reason: "missing_key" | "failed" };

export async function syncMacroIndicators(supabase: FinanceClient): Promise<MacroSyncResult> {
  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) {
    console.error("[macro] FRED_API_KEY is not set");
    return { ok: false, reason: "missing_key" };
  }

  let stored = 0;
  let failed = 0;
  for (const indicator of macroIndicators) {
    const seriesId = fredSeries[indicator];
    try {
      const observations = await fetchFredSeries(seriesId, apiKey);
      if (observations.length === 0) {
        failed += 1;
        console.error(`[macro] ${seriesId} returned no observations`);
        continue;
      }
      const saved = await supabase.from("macro_indicators").upsert(
        observations.map((point) => ({
          indicator: indicator satisfies MacroIndicator,
          value: point.value,
          date: point.date,
          source: `fred:${seriesId}`,
        })),
        { onConflict: "indicator,date" },
      );
      if (saved.error) {
        failed += 1;
        console.error(saved.error);
        continue;
      }
      stored += observations.length;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[macro] ${seriesId} skipped: ${message}`);
    }
  }

  if (stored === 0) return { ok: false, reason: "failed" };
  if (failed > 0) console.error(`[macro] ${failed} series were not stored`);
  return { ok: true, stored };
}
