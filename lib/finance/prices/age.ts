import { formatNumber } from "@/lib/finance/format";

const STALE_AFTER_MINUTES = 60;

export function priceAge(quotedAt: string, now = Date.now()): {
  minutes: number;
  stale: boolean;
  label: string;
} {
  const quoted = new Date(quotedAt).getTime();
  if (!Number.isFinite(quoted)) {
    return { minutes: Number.POSITIVE_INFINITY, stale: true, label: "آخرین آپدیت: نامشخص" };
  }

  const minutes = Math.max(0, Math.floor((now - quoted) / 60_000));
  const stale = minutes >= STALE_AFTER_MINUTES;
  const label =
    minutes < 1
      ? "آخرین آپدیت: همین الان"
      : minutes < 60
        ? `آخرین آپدیت: ${formatNumber(minutes, 0)} دقیقه پیش`
        : `آخرین آپدیت: ${formatNumber(Math.floor(minutes / 60), 0)} ساعت پیش`;

  return { minutes, stale, label };
}
