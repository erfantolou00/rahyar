"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
