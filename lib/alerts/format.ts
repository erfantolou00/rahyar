import { formatNumber, toNumber } from "@/lib/finance/format";
import { alertKindLabels, assetTypeLabels } from "@/lib/finance/labels";
import type { Alert } from "@/lib/finance/types";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(date);
}

export function formatAlertMessage(alert: Alert): string {
  const description = alert.message?.trim() || alert.rule.trim();
  const lines = [
    "هشدار رهیار",
    `نوع: ${alertKindLabels[alert.kind]}`,
  ];

  if (alert.asset_type) {
    lines.push(`دارایی: ${assetTypeLabels[alert.asset_type]}`);
  }

  lines.push(`شرح: ${description}`);
  lines.push(`آستانه: ${formatNumber(toNumber(alert.threshold))}`);
  lines.push(`زمان: ${formatWhen(alert.created_at)}`);
  return lines.join("\n");
}
