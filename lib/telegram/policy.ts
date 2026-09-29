import type { NotifyFrequency } from "@/lib/finance/types";

const WINDOW_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
} as const;

export type DeliveryDecision = "send" | "wait" | "skip";

/**
 * immediate: send now.
 * daily / weekly: send when the last successful delivery for this kind is outside the window.
 * off: do not send. The row stays unsent so a later frequency change can still deliver it.
 * A failed attempt does not move lastSentAt, so the next run can retry.
 */
export function deliveryDecision(
  frequency: NotifyFrequency,
  lastSentAt: string | null,
  now: Date,
): DeliveryDecision {
  if (frequency === "off") return "skip";
  if (frequency === "immediate") return "send";

  if (!lastSentAt) return "send";
  const last = Date.parse(lastSentAt);
  if (!Number.isFinite(last)) return "send";
  return now.getTime() - last >= WINDOW_MS[frequency] ? "send" : "wait";
}
