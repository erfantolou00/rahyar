"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseRequiredNumber, readString } from "@/lib/finance/parse";
import { isAlertKind, isNotifyFrequency } from "@/lib/finance/types";
import { dispatchTelegramAlerts } from "@/lib/telegram/dispatch";
import { requireSession } from "@/lib/supabase/auth";

const CHAT_ID = /^-?[0-9]{1,20}$/;
const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

function normalizeChatId(value: string): string {
  let chatId = value.replace(/\s/g, "");
  for (let index = 0; index < 10; index += 1) {
    chatId = chatId
      .replaceAll(persianDigits[index] ?? "", String(index))
      .replaceAll(arabicDigits[index] ?? "", String(index));
  }
  return chatId;
}

function fail(code: "invalid" | "save" | "chat_locked" | "chat_missing" | "telegram"): never {
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

  await dispatchTelegramAlerts(supabase);
  revalidatePath("/alerts");
  redirect("/alerts");
}

export async function setTelegramChatId(formData: FormData) {
  const { supabase, userId } = await requireSession();
  const chatId = normalizeChatId(readString(formData, "telegram_chat_id"));
  if (!CHAT_ID.test(chatId)) fail("invalid");

  const existing = await supabase.from("settings").select("telegram_chat_id").maybeSingle();
  if (existing.error) {
    console.error(existing.error);
    fail("save");
  }
  if (existing.data?.telegram_chat_id) fail("chat_locked");

  const write = existing.data
    ? await supabase
        .from("settings")
        .update({ telegram_chat_id: chatId })
        .eq("user_id", userId)
        .is("telegram_chat_id", null)
        .select("telegram_chat_id")
    : await supabase.from("settings").insert({ user_id: userId, telegram_chat_id: chatId }).select("telegram_chat_id");

  if (write.error) {
    console.error(write.error);
    if (write.error.code === "23514" || write.error.code === "23505") fail("chat_locked");
    fail("save");
  }
  if (!write.data?.length) fail("chat_locked");

  revalidatePath("/alerts");
  redirect("/alerts");
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

export async function retryTelegramDelivery() {
  const { supabase } = await requireSession();
  const result = await dispatchTelegramAlerts(supabase);
  if (!result.ok) fail("telegram");
  if (result.missingChat && result.sent === 0 && result.failed === 0) fail("chat_missing");

  revalidatePath("/alerts");
  redirect(`/alerts?telegram=${result.sent}-${result.failed}-${result.waiting}-${result.skipped}`);
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
