import type { FinanceClient } from "@/lib/finance/queries";
import type { Alert, AlertFrequency, NotifyFrequency } from "@/lib/finance/types";
import { isNotifyFrequency } from "@/lib/finance/types";
import { formatAlertMessage } from "@/lib/alerts/format";
import { deliveryDecision } from "@/lib/alerts/frequency-policy";
import { sendBaleMessage, type BaleSendResult } from "@/lib/bale/send";
import { sendBrowserNotification, type PushSendResult, type PushTarget } from "@/lib/notify/push";

const BATCH = 20;

export type DispatchCounts = {
  sent: number;
  failed: number;
  waiting: number;
  skipped: number;
  missingSubscription: boolean;
};

export type DispatchOutcome =
  | ({ ok: true } & DispatchCounts)
  | { ok: false; missingSchema: boolean };

type SendPush = (target: PushTarget, text: string) => Promise<PushSendResult>;
type SendBale = (chatId: string, text: string) => Promise<BaleSendResult>;

type SubscriptionRow = PushTarget & { user_id: string };

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

export async function dispatchAlertNotifications(
  supabase: FinanceClient,
  options?: { alertId?: string; now?: Date; send?: SendPush; sendBale?: SendBale },
): Promise<DispatchOutcome> {
  const now = options?.now ?? new Date();
  const send = options?.send ?? sendBrowserNotification;
  const sendBale = options?.sendBale ?? sendBaleMessage;
  const empty: DispatchCounts = { sent: 0, failed: 0, waiting: 0, skipped: 0, missingSubscription: false };

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
  const [subscriptionResult, frequencyResult, settingsResult] = await Promise.all([
    supabase.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds),
    supabase.from("alert_frequencies").select("*").in("user_id", userIds),
    supabase.from("settings").select("user_id, bale_chat_id").in("user_id", userIds),
  ]);

  if (subscriptionResult.error) {
    console.error(subscriptionResult.error);
    return { ok: false, missingSchema: schemaGap(subscriptionResult.error) };
  }
  if (frequencyResult.error) {
    console.error(frequencyResult.error);
    return { ok: false, missingSchema: schemaGap(frequencyResult.error) };
  }
  if (settingsResult.error) {
    console.error(settingsResult.error);
    return { ok: false, missingSchema: schemaGap(settingsResult.error) };
  }

  const subscriptions = (subscriptionResult.data ?? []) as SubscriptionRow[];
  const frequencies = (frequencyResult.data ?? []) as AlertFrequency[];
  const chatByUser = new Map(
    ((settingsResult.data ?? []) as { user_id: string; bale_chat_id: string | null }[]).map((row) => [
      row.user_id,
      row.bale_chat_id,
    ]),
  );
  const counts = { ...empty };
  const stamped = new Map<string, string>();

  for (const alert of alerts) {
    const targets = subscriptions.filter((item) => item.user_id === alert.user_id);
    const chatId = chatByUser.get(alert.user_id) ?? null;
    const hasPush = targets.length > 0;
    const hasBale = Boolean(chatId);
    if (!hasPush && !hasBale) {
      counts.missingSubscription = true;
      continue;
    }

    const frequency = frequencyFor(frequencies, alert.user_id, alert.kind);
    const perAsset = alert.kind === "allocation_deviation" && alert.asset_type != null;
    const stampKey = perAsset ? `${alert.user_id}:${alert.kind}:${alert.asset_type}` : `${alert.user_id}:${alert.kind}`;
    const lastSentAt = perAsset ? stamped.get(stampKey) ?? null : stamped.get(stampKey) ?? lastSentFor(frequencies, alert.user_id, alert.kind);
    const decision = deliveryDecision(frequency, lastSentAt, now);

    if (decision === "skip") {
      counts.skipped += 1;
      continue;
    }
    if (decision === "wait") {
      counts.waiting += 1;
      continue;
    }

    const text = formatAlertMessage(alert);
    let pushDelivered = !hasPush;
    if (hasPush) {
      let delivered = false;
      for (const target of targets) {
        const result = await send(target, text);
        if (result.ok) {
          delivered = true;
          continue;
        }
        console.error(`Browser push failed: ${result.description}`);
        if (result.gone) {
          const removed = await supabase.from("push_subscriptions").delete().eq("id", target.id);
          if (removed.error) console.error(removed.error);
        }
      }
      pushDelivered = delivered;
    }

    let baleDelivered = !hasBale;
    if (hasBale && chatId) {
      const result = await sendBale(chatId, text);
      if (result.ok) baleDelivered = true;
      else console.error(`Bale send failed: ${result.description}`);
    }

    if (!pushDelivered || !baleDelivered) {
      counts.failed += 1;
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
    if (!remembered) console.error("Push was accepted but the frequency stamp was not saved");

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
