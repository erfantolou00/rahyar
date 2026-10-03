export const replyWarningCodes = ["numbers", "lines"] as const;

export type ReplyWarning = (typeof replyWarningCodes)[number];

export const replyWarningLabels: Record<ReplyWarning, string> = {
  numbers: "عددی خارج از داده‌های محاسبه‌شده دارد. مراقب باشید.",
  lines: "دقیقاً پنج خط نیست. مراقب باشید.",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isWarning(value: unknown): value is ReplyWarning {
  return replyWarningCodes.some((code) => code === value);
}

export function readReplyWarnings(context: unknown): ReplyWarning[] {
  const record = asRecord(context);
  const found = new Set<ReplyWarning>();
  if (Array.isArray(record?.warnings)) {
    for (const item of record.warnings) {
      if (isWarning(item)) found.add(item);
    }
  }
  if (record?.error === "rejected") found.add("numbers");
  if (record?.error === "lines") found.add("lines");
  return replyWarningCodes.filter((code) => found.has(code));
}

export function replyBody(message: string, context: unknown): string {
  const record = asRecord(context);
  const raw = typeof record?.raw === "string" ? record.raw.trim() : "";
  if (raw && readReplyWarnings(context).length > 0) return raw;
  return message;
}
