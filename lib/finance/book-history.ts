import { shiftDays } from "@/lib/finance/holding-growth";

export type BookPoint = {
  day: string;
  value: number;
};

export type HoldingClose = {
  day: string;
  assetId: string;
  price: number | null;
  value: number;
};

export type CloseLeg = {
  assetId: string;
  quantity: number;
  price: number | null;
  value: number;
};

export function priorClose(points: BookPoint[], today: string): BookPoint | null {
  const older = points.filter((point) => point.day < today).sort((left, right) => left.day.localeCompare(right.day));
  return older[older.length - 1] ?? null;
}

export function sincePriorClose(
  points: BookPoint[],
  today: string,
  live: number,
): { absolute: number; percent: number } | null {
  const previous = priorClose(points, today);
  if (!previous || !(previous.value > 0) || !Number.isFinite(live)) return null;
  const absolute = live - previous.value;
  return { absolute, percent: (absolute / previous.value) * 100 };
}

export function performanceSeries(points: BookPoint[], today: string, live: number, days = 30): BookPoint[] {
  const byDay = new Map(points.filter((point) => point.day <= today).map((point) => [point.day, point.value]));
  if (Number.isFinite(live) && live >= 0) byDay.set(today, live);
  const merged = [...byDay.entries()]
    .map(([day, value]) => ({ day, value }))
    .sort((left, right) => left.day.localeCompare(right.day));
  const start = shiftDays(today, days);
  const windowed = merged.filter((point) => point.day >= start);
  return windowed.length >= 2 ? windowed : merged;
}

export function holdingChart(
  rows: HoldingClose[],
  today: string,
  live: { price: number | null; value: number },
): { basis: "price" | "value"; points: { at: string; value: number }[] } {
  const byDay = new Map<string, { price: number | null; value: number }>();
  for (const row of rows) {
    if (row.day > today) continue;
    byDay.set(row.day, { price: row.price, value: row.value });
  }
  if (Number.isFinite(live.value) && live.value >= 0) {
    byDay.set(today, { price: live.price, value: live.value });
  }
  const merged = [...byDay.entries()]
    .map(([day, point]) => ({ day, ...point }))
    .sort((left, right) => left.day.localeCompare(right.day));
  const usePrice = merged.length > 0 && merged.every((point) => point.price != null && point.price >= 0);
  return {
    basis: usePrice ? "price" : "value",
    points: merged.map((point) => ({
      at: point.day,
      value: usePrice ? (point.price ?? 0) : point.value,
    })),
  };
}

export function historyCaption(pointCount: number, missingSchema: boolean): string {
  if (missingSchema) return "جدول ارزش شبانه هنوز در پایگاه نیست.";
  if (pointCount >= 2) return "هر نقطه ارزش پایانی یک شب است، به وقت تهران.";
  if (pointCount === 1) return "اولین شب ثبت شد. سود امروز و خط روند از شب بعد حساب می‌شود.";
  return "هنوز ارزش شبانه‌ای ثبت نشده است.";
}
