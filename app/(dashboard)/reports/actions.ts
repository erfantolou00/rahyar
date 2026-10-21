"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { interpretWeeklyReport } from "@/lib/ai/interpret-weekly";
import { readManualSheet, storedSheet, sheetHasNumbers } from "@/lib/finance/fis-manual";
import { parseOptionalNumber, parseRequiredNumber, parseSymbol, readString } from "@/lib/finance/parse";
import { publishFisReport } from "@/lib/finance/publish-fis";
import { publishWeeklyReport } from "@/lib/finance/publish-weekly";
import { loadPortfolio, snapshotJson, type FinanceClient } from "@/lib/finance/queries";
import { requireSession } from "@/lib/supabase/auth";

export async function captureReport() {
  const { supabase } = await requireSession();
  const portfolio = await loadPortfolio(supabase);
  if (!portfolio.ok) redirect("/reports?error=save");

  const { error } = await supabase.from("reports").insert({
    type: "event",
    content: snapshotJson(portfolio.data),
  });

  if (error) {
    console.error(error);
    redirect("/reports?error=save");
  }

  revalidatePath("/reports");
  redirect("/reports");
}

export async function createWeeklyReport() {
  const { supabase, userId } = await requireSession();
  const result = await publishWeeklyReport(supabase, userId, { force: true });
  if (!result.ok || result.status !== "created") redirect("/reports?error=save");

  const interpreted = await interpretWeeklyReport(supabase, userId, result.id);
  revalidatePath("/reports");
  revalidatePath(`/reports/${result.id}`);
  const interpret = interpreted.ok ? "" : `&interpret=${interpreted.code}`;
  redirect(`/reports/${result.id}?delivery=${result.delivery.bale}-${result.delivery.push}${interpret}`);
}

export async function createFisReport(formData: FormData) {
  const akhza = parseRequiredNumber(readString(formData, "akhza"), { min: 0, max: 200, exclusiveMin: true });
  const inflationText = readString(formData, "inflation");
  const inflation = inflationText ? parseOptionalNumber(inflationText, { min: -20, max: 400 }) : null;
  const sheet = readManualSheet(formData);
  const symbol = parseSymbol(readString(formData, "symbol"));
  const oneStock = readString(formData, "scope") === "one";
  if (akhza == null || inflation === undefined || !sheet || (oneStock && !symbol)) redirect("/reports?error=invalid");

  const { supabase } = await requireSession();
  let sheetMissing = false;
  if (symbol && sheetHasNumbers(sheet)) {
    const saved = await saveManualSheet(supabase, symbol, storedSheet(sheet));
    sheetMissing = !saved;
  }
  const result = await publishFisReport(
    supabase,
    akhza,
    inflation,
    oneStock
      ? { only: symbol, sheet, sheetSymbol: symbol }
      : { sheet: symbol && sheetHasNumbers(sheet) ? sheet : null, sheetSymbol: symbol },
  );
  if (!result.ok) redirect(`/reports?error=${result.code === "symbol" ? "symbol" : "save"}`);

  revalidatePath("/reports");
  revalidatePath(`/reports/${result.id}`);
  redirect(`/reports/${result.id}${sheetMissing ? "?sheet=missing" : ""}`);
}

async function saveManualSheet(supabase: FinanceClient, symbol: string, sheet: ReturnType<typeof storedSheet>): Promise<boolean> {
  const existing = await supabase.from("stock_fundamentals").select("symbol").eq("symbol", symbol).maybeSingle();
  if (existing.error) {
    console.error(existing.error);
    return false;
  }
  const saved = existing.data
    ? await supabase.from("stock_fundamentals").update({ manual_sheet: sheet }).eq("symbol", symbol)
    : await supabase.from("stock_fundamentals").insert({ symbol, source: "manual", sales_trend: [], manual_sheet: sheet });
  if (saved.error) {
    console.error(saved.error);
    return false;
  }
  return true;
}
