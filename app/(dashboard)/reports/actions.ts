"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { interpretWeeklyReport } from "@/lib/ai/interpret-weekly";
import { ensureLivePrices } from "@/lib/finance/prices/ensure";
import { publishWeeklyReport } from "@/lib/finance/publish-weekly";
import { loadPortfolio, snapshotJson } from "@/lib/finance/queries";
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
  await ensureLivePrices(supabase);
  const result = await publishWeeklyReport(supabase, userId, { force: true });
  if (!result.ok || result.status !== "created") redirect("/reports?error=save");

  const interpreted = await interpretWeeklyReport(supabase, userId, result.id);
  revalidatePath("/reports");
  revalidatePath(`/reports/${result.id}`);
  const interpret = interpreted.ok ? "" : `&interpret=${interpreted.code}`;
  redirect(`/reports/${result.id}?delivery=${result.delivery.bale}-${result.delivery.push}${interpret}`);
}
