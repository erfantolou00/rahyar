import type { FinanceClient } from "@/lib/finance/queries";
import type { Alert, AlertFrequency, NotifyFrequency, UserSettings } from "@/lib/finance/types";
import { isNotifyFrequency } from "@/lib/finance/types";
import { formatAlertMessage } from "@/lib/telegram/message";
import { deliveryDecision } from "@/lib/telegram/policy";
import { sendTelegramMessage, type TelegramSendResult } from "@/lib/telegram/send";

const BATCH = 20;

export type DispatchCounts = {
  sent: number;
  failed: number;
  waiting: number;
  skipped: number;
  missingChat: boolean;
};

export type DispatchOutcome =
  | ({ ok: true } & DispatchCounts)
  | { ok: false; missingSchema: boolean };

type SendMessage = (token: string, chatId: string, text: string) => Promise<TelegramSendResult>;

function schemaGap(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.code === "42703" ||
    error.code === "42P01" ||
    /schema cache|does not exist|could not find the/i.test(error.message ?? "")
  );
}

function frequencyFor(rows: AlertFrequency[], userId: string, kind: Alert["kind"]): NotifyFrequency {
  const row = rows.find((item) => item.user_id === userId && item.kind === kind);
  return row && isNotifyFrequency(row.frequency) ? row.frequency : "immediate";
}

function lastSentFor(rows: AlertFrequency[], userId: string, kind: Alert["kind"]): string | null {
  return rows.find((item) => item.user_id === userId && item.kind === kind)?.last_sent_at ?? null;
}

export async function dispatchTelegramAlerts(
  supabase: FinanceClient,
  options?: { alertId?: string; now?: Date; send?: SendMessage },
): Promise<DispatchOutcome> {
  const now = options?.now ?? new Date();
  const send = options?.send ?? sendTelegramMessage;
  const empty: DispatchCounts = { sent: 0, failed: 0, waiting: 0, skipped: 0, missingChat: false };

  let query = supabase
    .from("alerts")
    .select("*")
    .eq("sent", false)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (options?.alertId) query = query.eq("id", options.alertId);

  const pending = await query;
  if (pending.error) {
    console.error(pending.error);
    return { ok: false, missingSchema: schemaGap(pending.error) };
  }

  const alerts = (pending.data ?? []) as Alert[];
  if (alerts.length === 0) return { ok: true, ...empty };

  const userIds = [...new Set(alerts.map((alert) => alert.user_id))];
  const [settingsResult, frequencyResult] = await Promise.all([
    supabase.from("settings").select("user_id, telegram_chat_id").in("user_id", userIds),
    supabase.from("alert_frequencies").select("*").in("user_id", userIds),
  ]);

  if (settingsResult.error) {
    console.error(settingsResult.error);
    return { ok: false, missingSchema: schemaGap(settingsResult.error) };
  }
  if (frequencyResult.error) {
    console.error(frequencyResult.error);
    return { ok: false, missingSchema: schemaGap(frequencyResult.error) };
  }

  const settings = (settingsResult.data ?? []) as Pick<UserSettings, "user_id" | "telegram_chat_id">[];
  const frequencies = (frequencyResult.data ?? []) as AlertFrequency[];
  const chatByUser = new Map(settings.map((row) => [row.user_id, row.telegram_chat_id]));
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
  const counts = { ...empty };
  const stamped = new Map<string, string>();
  let loggedMissingToken = false;

  for (const alert of alerts) {
    const chatId = chatByUser.get(alert.user_id)?.trim() || "";
    if (!chatId) {
      counts.missingChat = true;
      continue;
    }

    const frequency = frequencyFor(frequencies, alert.user_id, alert.kind);
    const stampKey = `${alert.user_id}:${alert.kind}`;
    const lastSentAt = stamped.get(stampKey) ?? lastSentFor(frequencies, alert.user_id, alert.kind);
    const decision = deliveryDecision(frequency, lastSentAt, now);

    if (decision === "skip") {
      counts.skipped += 1;
      continue;
    }
    if (decision === "wait") {
      counts.waiting += 1;
      continue;
    }
    if (!token) {
      if (!loggedMissingToken) {
        console.error("Missing TELEGRAM_BOT_TOKEN");
        loggedMissingToken = true;
      }
      counts.failed += 1;
      continue;
    }

    const delivered = await send(token, chatId, formatAlertMessage(alert));
    if (!delivered.ok) {
      console.error(`Telegram send failed: ${delivered.description}`);
      counts.failed += 1;
      if (/timeout|network|fetch|aborted|ECONN|ENOTFOUND|HTTP 5/i.test(delivered.description)) break;
      continue;
    }

    const sentAt = now.toISOString();
    const marked = await supabase
      .from("alerts")
      .update({ sent: true, sent_at: sentAt })
      .eq("id", alert.id)
      .eq("sent", false)
      .select("id");

    if (marked.error) {
      console.error(marked.error);
      counts.failed += 1;
      continue;
    }
    if (!marked.data?.length) continue;

    const remembered = await rememberDelivery(supabase, alert, frequency, sentAt);
    if (!remembered) {
      console.error("Telegram accepted the message but the frequency stamp was not saved");
    }

    stamped.set(stampKey, sentAt);
    counts.sent += 1;
  }

  return { ok: true, ...counts };
}

async function rememberDelivery(
  supabase: FinanceClient,
  alert: Alert,
  frequency: NotifyFrequency,
  sentAt: string,
): Promise<boolean> {
  const updated = await supabase
    .from("alert_frequencies")
    .update({ last_sent_at: sentAt })
    .eq("user_id", alert.user_id)
    .eq("kind", alert.kind)
    .select("kind");

  if (updated.error) {
    console.error(updated.error);
    return false;
  }
  if (updated.data?.length) return true;

  const inserted = await supabase.from("alert_frequencies").insert({
    user_id: alert.user_id,
    kind: alert.kind,
    frequency,
    last_sent_at: sentAt,
  });

  if (inserted.error) {
    console.error(inserted.error);
    return false;
  }
  return true;
}
