export function toNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const moneyUnit = "ریال";

export function formatNumber(value: number, digits = 4): string {
  return new Intl.NumberFormat("fa-IR", {
    useGrouping: true,
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatMoney(value: number): string {
  const amount = new Intl.NumberFormat("fa-IR", {
    useGrouping: true,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
  return `${amount} ${moneyUnit}`;
}

export function formatPercent(value: number): string {
  return `${formatNumber(value, 2)}٪`;
}

export function formatDay(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(
    new Date(year, month - 1, day),
  );
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(date);
}
