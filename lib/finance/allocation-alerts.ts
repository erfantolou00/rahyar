import {
  allocationDeviations,
  type AllocationDeviation,
} from "@/lib/finance/allocation-deviation";
import { readRows, type FinanceClient, type LoadResult } from "@/lib/finance/queries";
import { isNotifyFrequency, type AlertFrequency, type Allocation, type Alert, type AssetType, type NotifyFrequency, type PortfolioSnapshot } from "@/lib/finance/types";
import { dispatchAlertNotifications } from "@/lib/notify/dispatch";
import { deliveryDecision } from "@/lib/alerts/frequency-policy";

/**
 * Stores allocation_deviation rows for display.
 * Nothing in this file creates a transaction or calls a broker.
 */

export const ALLOCATION_DEVIATION_KIND = "allocation_deviation" as const;
export const DEVIATION_CHANNEL = "in_app" as const;
export const DEVIATION_FREQUENCY = "display_only" as const;

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

/** Requeue when the sentence changes, or when a sent row's own cadence window has elapsed. */
export function deviationShouldRequeue(
  sent: boolean,
  sentAt: string | null,
  frequency: NotifyFrequency,
  now: Date,
  changed: boolean,
): boolean {
  if (changed) return true;
  if (!sent) return false;
  return deliveryDecision(frequency, sentAt, now) === "send";
}

export function deviationsForSnapshot(
  snapshot: PortfolioSnapshot,
  allocations: Allocation[],
  at?: Date,
): AllocationDeviation[] {
  return allocationDeviations(snapshot, allocations, at);
}

export async function syncAllocationDeviationAlerts(
  supabase: FinanceClient,
  deviations: AllocationDeviation[],
): Promise<LoadResult<AllocationDeviation[]>> {
  const existing = await readRows<Alert>(
    supabase.from("alerts").select("*").eq("kind", ALLOCATION_DEVIATION_KIND).eq("is_active", true),
  );
  if (!existing.ok) return existing;

  const finish = async (result: LoadResult<AllocationDeviation[]>) => {
    await dispatchAlertNotifications(supabase);
    return result;
  };

  const frequencyRows = await readRows<AlertFrequency>(
    supabase.from("alert_frequencies").select("*").eq("kind", ALLOCATION_DEVIATION_KIND),
  );
  if (!frequencyRows.ok) return frequencyRows;
  const storedFrequency = frequencyRows.data[0]?.frequency;
  const frequency = storedFrequency && isNotifyFrequency(storedFrequency) ? storedFrequency : "immediate";
  const now = new Date();

  const pending = new Map<AssetType, Alert>();
  for (const row of existing.data) {
    if (row.asset_type) pending.set(row.asset_type, row);
  }

  for (const deviation of deviations) {
    const current = pending.get(deviation.assetType);
    pending.delete(deviation.assetType);
    const message = deviation.message.slice(0, 500);

    if (!current) {
      const { error } = await supabase.from("alerts").insert({
        kind: ALLOCATION_DEVIATION_KIND,
        asset_type: deviation.assetType,
        message,
        rule: ALLOCATION_DEVIATION_KIND,
        threshold: deviation.shiftPercent,
        channel: DEVIATION_CHANNEL,
        frequency: DEVIATION_FREQUENCY,
        is_active: true,
      });
      if (error) {
        if (error.code === "23505") continue;
        console.error(error);
        return finish({ ok: false, missingSchema: schemaGap(error) });
      }
      continue;
    }

    const changed = current.message !== message || Number(current.threshold) !== deviation.shiftPercent;
    if (!deviationShouldRequeue(current.sent, current.sent_at, frequency, now, changed)) continue;

    const { error } = await supabase
      .from("alerts")
      .update({
        message,
        rule: ALLOCATION_DEVIATION_KIND,
        threshold: deviation.shiftPercent,
        channel: DEVIATION_CHANNEL,
        frequency: DEVIATION_FREQUENCY,
        is_active: true,
        sent: false,
        sent_at: null,
      })
      .eq("id", current.id);
    if (error) {
      console.error(error);
      return finish({ ok: false, missingSchema: schemaGap(error) });
    }
  }

  for (const stale of pending.values()) {
    const { error } = await supabase.from("alerts").update({ is_active: false }).eq("id", stale.id);
    if (error) {
      console.error(error);
      return finish({ ok: false, missingSchema: schemaGap(error) });
    }
  }

  return finish({ ok: true, data: deviations });
}
