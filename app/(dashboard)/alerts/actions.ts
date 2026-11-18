"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isBaleChatId, latestBaleChatId, ownBaleId } from "@/lib/bale/send";
import { readString } from "@/lib/finance/parse";
import { isNotifyFrequency, type AlertKind } from "@/lib/finance/types";
import { dispatchAlertNotifications } from "@/lib/notify/dispatch";
import { requireSession } from "@/lib/supabase/auth";

function fail(code: "invalid" | "save" | "push_missing" | "push" | "bale_token" | "bale_chat" | "bale_invalid" | "bale_self"): never {
  redirect(`/alerts?error=${code}`);
}

const deliveryKinds = ["allocation_deviation", "codal_notice", "fis_change"] as const satisfies readonly AlertKind[];

export async function setAlertFrequencies(formData: FormData) {
  const { supabase, userId } = await requireSession();
  const rows = [];
  for (const kind of deliveryKinds) {
    const frequency = readString(formData, kind);
    if (!isNotifyFrequency(frequency)) fail("invalid");
    rows.push({ user_id: userId, kind, frequency });
  }

  const { error } = await supabase.from("alert_frequencies").upsert(rows, { onConflict: "user_id,kind" });
  if (error) {
    console.error(error);
    fail("save");
  }

  revalidatePath("/alerts");
  redirect("/alerts");
}

export async function deleteManualAlert(formData: FormData) {
  const { supabase } = await requireSession();
  const id = readString(formData, "id");
  if (!id) fail("invalid");

  const { error } = await supabase.from("alerts").delete().eq("id", id).eq("kind", "rule");
  if (error) {
    console.error(error);
    fail("save");
  }

  revalidatePath("/alerts");
  redirect("/alerts");
}

async function saveBaleChatId(chatId: string) {
  const { supabase, userId } = await requireSession();
  const { error } = await supabase.from("settings").upsert(
    { user_id: userId, bale_chat_id: chatId },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error(error);
    fail("save");
  }
  revalidatePath("/alerts");
  redirect("/alerts");
}

export async function setBaleChatId(formData: FormData) {
  await requireSession();
  const chatId = readString(formData, "chat_id").trim();
  if (!isBaleChatId(chatId)) fail("bale_invalid");
  const ownId = await ownBaleId();
  if (ownId && chatId === ownId) fail("bale_self");
  await saveBaleChatId(chatId);
}

export async function linkBaleChat() {
  await requireSession();
  const found = await latestBaleChatId();
  if (!found.ok) {
    if (found.description === "missing token") fail("bale_token");
    console.error(found.description);
    fail("bale_chat");
  }
  await saveBaleChatId(found.chatId);
}

export async function retryAlertDelivery() {
  const { supabase } = await requireSession();
  const result = await dispatchAlertNotifications(supabase);
  if (!result.ok) fail("push");
  if (result.missingSubscription && result.sent === 0 && result.failed === 0) fail("push_missing");

  revalidatePath("/alerts");
  redirect(`/alerts?delivery=${result.sent}-${result.failed}-${result.waiting}-${result.skipped}`);
}
