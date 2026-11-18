"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isBaleChatId, latestBaleChatId, ownBaleId } from "@/lib/bale/send";
import { parseRequiredNumber, readString } from "@/lib/finance/parse";
import { isAlertKind, isNotifyFrequency } from "@/lib/finance/types";
import { dispatchAlertNotifications } from "@/lib/notify/dispatch";
import { requireSession } from "@/lib/supabase/auth";

function fail(code: "invalid" | "save" | "push_missing" | "push" | "bale_token" | "bale_chat" | "bale_invalid" | "bale_self"): never {
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

  await dispatchAlertNotifications(supabase);
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

export async function setAlertFrequency(formData: FormData) {
  const { supabase, userId } = await requireSession();
  const kind = readString(formData, "kind");
  const frequency = readString(formData, "frequency");
  if (!isAlertKind(kind) || !isNotifyFrequency(frequency)) fail("invalid");

  const { error } = await supabase.from("alert_frequencies").upsert(
    { user_id: userId, kind, frequency },
    { onConflict: "user_id,kind" },
  );
  if (error) {
    console.error(error);
    fail("save");
  }

  revalidatePath("/alerts");
  redirect("/alerts");
}

export async function retryAlertDelivery() {
  const { supabase } = await requireSession();
  const result = await dispatchAlertNotifications(supabase);
  if (!result.ok) fail("push");
  if (result.missingSubscription && result.sent === 0 && result.failed === 0) fail("push_missing");

  revalidatePath("/alerts");
  redirect(`/alerts?delivery=${result.sent}-${result.failed}-${result.waiting}-${result.skipped}`);
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
