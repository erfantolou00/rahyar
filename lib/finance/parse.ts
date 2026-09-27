import {
  assetTypes,
  chatRoles,
  reportTypes,
  transactionTypes,
  type AssetType,
  type ChatRole,
  type ReportType,
  type TransactionType,
} from "@/lib/finance/types";

export function readString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function isAssetType(value: string): value is AssetType {
  return (assetTypes as readonly string[]).includes(value);
}

export function isTransactionType(value: string): value is TransactionType {
  return (transactionTypes as readonly string[]).includes(value);
}

export function isReportType(value: string): value is ReportType {
  return (reportTypes as readonly string[]).includes(value);
}

export function isChatRole(value: string): value is ChatRole {
  return (chatRoles as readonly string[]).includes(value);
}

const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

export function normalizeNumericInput(value: string): string {
  let normalized = value.trim();
  for (let index = 0; index < 10; index += 1) {
    normalized = normalized
      .replaceAll(persianDigits[index] ?? "", String(index))
      .replaceAll(arabicDigits[index] ?? "", String(index));
  }
  return normalized.replace(/[,\u066C\u066B\s\u00A0]/g, "").replace("٫", ".");
}

export function parseRequiredNumber(
  value: string,
  options: { min?: number; max?: number; exclusiveMin?: boolean } = {},
): number | null {
  if (!value.trim()) return null;
  const parsed = Number(normalizeNumericInput(value));
  if (!Number.isFinite(parsed)) return null;
  if (options.min != null && parsed < options.min) return null;
  if (options.exclusiveMin && options.min != null && parsed <= options.min) return null;
  if (options.max != null && parsed > options.max) return null;
  return parsed;
}

export function parseOptionalNumber(
  value: string,
  options: { min?: number; max?: number } = {},
): number | null | undefined {
  if (!value) return null;
  const parsed = parseRequiredNumber(value, options);
  return parsed == null ? undefined : parsed;
}

export function parseRiskLevel(value: string): number | null | undefined {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return undefined;
  return parsed;
}

export function parseSymbol(value: string): string | null {
  const symbol = value.trim();
  if (symbol.length < 1 || symbol.length > 32) return null;
  return symbol;
}

export function parseNote(value: string): string | null | undefined {
  const note = value.trim();
  if (!note) return null;
  if (note.length > 500) return undefined;
  return note;
}

export function parseDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}
