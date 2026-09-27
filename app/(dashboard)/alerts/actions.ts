"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseRequiredNumber, readString } from "@/lib/finance/parse";
import { requireSession } from "@/lib/supabase/auth";

function fail(code: "invalid" | "save"): never {
  redirect(`/alerts?error=${code}`);
}

export async function createAlert(formData: FormData) {
  const { supabase } = await requireSession();
  const rule = readString(formData, "rule");
  const threshold = parseRequiredNumber(readString(formData, "threshold"));
  const channel = readString(formData, "channel");
  const frequency = readString(formData, "frequency");

  if (!rule || rule.length > 200 || threshold == null || !channel || channel.length > 40 || !frequency || frequency.length > 40) {
    fail("invalid");
  }

  const { error } = await supabase.from("alerts").insert({
    rule,
    threshold,
    channel,
    frequency,
    is_active: true,
  });

  if (error) {
    console.error(error);
    fail("save");
  }

  revalidatePath("/alerts");
  redirect("/alerts");
}

export async function setAlertActive(formData: FormData) {
  const { supabase } = await requireSession();
  const id = readString(formData, "id");
  const isActive = readString(formData, "is_active") === "true";
  if (!id) fail("invalid");

  const { error } = await supabase.from("alerts").update({ is_active: isActive }).eq("id", id);
  if (error) {
    console.error(error);
    fail("save");
  }

  revalidatePath("/alerts");
  redirect("/alerts");
}
