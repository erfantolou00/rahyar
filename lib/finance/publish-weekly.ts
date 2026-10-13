import { deviationsForSnapshot, syncAllocationDeviationAlerts } from "@/lib/finance/allocation-alerts";
import { buildPortfolio } from "@/lib/finance/portfolio";
import { ensureLivePrices } from "@/lib/finance/prices/ensure";
import { loadLatestPrices, readRows, type FinanceClient } from "@/lib/finance/queries";
import type { Alert, Allocation, Asset } from "@/lib/finance/types";
import {
  baselineWeekly,
  buildWeeklyReport,
  formatWeeklySummary,
  shouldCreateWeekly,
  weeklyContentJson,
} from "@/lib/finance/weekly";
import { sendBaleMessage, type BaleSendResult } from "@/lib/bale/send";
import { sendBrowserNotification, type PushNotice, type PushSendResult, type PushTarget } from "@/lib/notify/push";

export type WeeklyChannel = "sent" | "failed" | "skipped";

export type PublishWeeklyResult =
  | { ok: true; status: "created"; id: string; delivery: { bale: WeeklyChannel; push: WeeklyChannel } }
  | { ok: true; status: "skipped" }
  | { ok: false; missingSchema: boolean };

type SendPush = (target: PushTarget, text: string, notice?: PushNotice) => Promise<PushSendResult>;
type SendBale = (chatId: string, text: string) => Promise<BaleSendResult>;

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

/**
 * Refreshes that user's stored prices and writes allocation deviations even when the weekly row already exists.
 * A new numeric report is inserted only when the previous one is old enough, or when force is set.
 * Phase 6 should update `commentary` on the saved row afterwards, through withCommentary.
 */
export async function publishWeeklyReport(
  supabase: FinanceClient,
  userId: string,
  options?: { now?: Date; force?: boolean; sendPush?: SendPush; sendBale?: SendBale },
): Promise<PublishWeeklyResult> {
  const now = options?.now ?? new Date();
  const reports = await readRows<{ created_at: string; content: unknown }>(
    supabase
      .from("reports")
      .select("created_at, content")
      .eq("user_id", userId)
      .eq("type", "weekly")
      .order("created_at", { ascending: false })
      .limit(30),
  );
  if (!reports.ok) return reports;

  await ensureLivePrices(supabase, userId, now);

  const [assets, allocations] = await Promise.all([
    readRows<Asset>(supabase.from("assets").select("*").eq("user_id", userId)),
    readRows<Allocation>(supabase.from("allocations").select("*").eq("user_id", userId)),
  ]);
  const failed = [assets, allocations].find((result) => !result.ok);
  if (failed && !failed.ok) return failed;
  if (!assets.ok || !allocations.ok) return { ok: false, missingSchema: false };

  const prices = await loadLatestPrices(supabase, assets.data, userId);
  if (!prices.ok) return prices;

  const snapshot = buildPortfolio(assets.data, prices.data, allocations.data);
  const synced = await syncAllocationDeviationAlerts(
    supabase,
    userId,
    deviationsForSnapshot(snapshot, allocations.data, now),
  );
  if (!synced.ok) {
    if (synced.missingSchema) return synced;
    console.error("Allocation deviations were not saved before the weekly report");
  }

  const latest = [...reports.data].sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
  )[0];
  if (!options?.force && !shouldCreateWeekly(latest?.created_at ?? null, now)) {
    return { ok: true, status: "skipped" };
  }

  const alerts = await readRows<Alert>(supabase.from("alerts").select("*").eq("user_id", userId));
  if (!alerts.ok) return alerts;

  const content = buildWeeklyReport({
    now,
    snapshot,
    previous: baselineWeekly(reports.data, now),
    alerts: alerts.data,
  });

  const inserted = await supabase
    .from("reports")
    .insert({ user_id: userId, type: "weekly", content: weeklyContentJson(content) })
    .select("id")
    .single();

  if (inserted.error || !inserted.data) {
    console.error(inserted.error);
    return { ok: false, missingSchema: schemaGap(inserted.error) };
  }

  const delivery = await deliverWeeklySummary(
    supabase,
    userId,
    inserted.data.id,
    formatWeeklySummary(content),
    options?.sendPush ?? sendBrowserNotification,
    options?.sendBale ?? sendBaleMessage,
  );

  return { ok: true, status: "created", id: inserted.data.id, delivery };
}

async function deliverWeeklySummary(
  supabase: FinanceClient,
  userId: string,
  reportId: string,
  text: string,
  sendPush: SendPush,
  sendBale: SendBale,
): Promise<{ bale: WeeklyChannel; push: WeeklyChannel }> {
  const [settings, subscriptions] = await Promise.all([
    supabase.from("settings").select("bale_chat_id").eq("user_id", userId).maybeSingle(),
    readRows<PushTarget>(
      supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId),
    ),
  ]);

  let bale: WeeklyChannel = "skipped";
  const chatId = settings.data?.bale_chat_id ?? null;
  if (settings.error) {
    console.error(settings.error);
    bale = "failed";
  } else if (chatId) {
    const result = await sendBale(chatId, text);
    bale = result.ok ? "sent" : "failed";
    if (!result.ok) console.error(`Bale weekly summary failed: ${result.description}`);
  }

  let push: WeeklyChannel = "skipped";
  if (!subscriptions.ok) {
    push = "failed";
  } else if (subscriptions.data.length > 0) {
    let delivered = false;
    for (const target of subscriptions.data) {
      const result = await sendPush(target, text, { title: "گزارش هفتگی رهیار", url: `/reports/${reportId}` });
      if (result.ok) {
        delivered = true;
        continue;
      }
      console.error(`Weekly push failed: ${result.description}`);
      if (result.gone) {
        const removed = await supabase.from("push_subscriptions").delete().eq("id", target.id);
        if (removed.error) console.error(removed.error);
      }
    }
    push = delivered ? "sent" : "failed";
  }

  return { bale, push };
}
