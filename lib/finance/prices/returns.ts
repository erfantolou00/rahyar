import { MarketShapeError } from "@/lib/finance/prices/shape-error";

export type CloseBar = {
  day: number;
  close: number;
};

export type ReturnReport = {
  lastClose: number | null;
  dailyChange: number | null;
  dailyPercent: number | null;
  monthPercent: number | null;
  quarterPercent: number | null;
  yearPercent: number | null;
};

const EMPTY_RETURNS: ReturnReport = {
  lastClose: null,
  dailyChange: null,
  dailyPercent: null,
  monthPercent: null,
  quarterPercent: null,
  yearPercent: null,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/[,،]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function changePercent(last: number, base: number): number | null {
  if (!(base > 0) || !Number.isFinite(last)) return null;
  return roundPercent((last / base - 1) * 100);
}

export function shiftMonths(day: number, months: number): number {
  const year = Math.floor(day / 10000);
  const month = Math.floor((day % 10000) / 100);
  const date = day % 100;
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const clamped = Math.min(date, lastDay);
  return target.getUTCFullYear() * 10000 + (target.getUTCMonth() + 1) * 100 + clamped;
}

export function parseTsetmcDailyCloses(payload: unknown): CloseBar[] {
  const record = asRecord(payload);
  if (!record || !Array.isArray(record.closingPriceDaily)) {
    throw new MarketShapeError("closingPriceDaily");
  }
  const bars = record.closingPriceDaily.flatMap((item) => {
    const row = asRecord(item);
    const day = numeric(row?.dEven);
    const close = numeric(row?.pClosing) ?? numeric(row?.pDrCotVal);
    if (day == null || !Number.isInteger(day) || day < 19900101 || close == null || !(close > 0)) return [];
    return [{ day, close }];
  });
  if (record.closingPriceDaily.length > 0 && bars.length === 0) {
    throw new MarketShapeError("closing price rows");
  }
  return bars;
}

export function appendLiveClose(bars: CloseBar[], asOfDay: number, livePrice: number | null): CloseBar[] {
  if (livePrice == null || !(livePrice > 0) || !Number.isInteger(asOfDay)) return bars;
  if (bars.some((bar) => bar.day >= asOfDay)) return bars;
  return [...bars, { day: asOfDay, close: livePrice }];
}

function latestOnOrBefore(bars: CloseBar[], day: number, before: number): CloseBar | null {
  let found: CloseBar | null = null;
  for (const bar of bars) {
    if (bar.day <= day && bar.day < before && (found == null || bar.day > found.day)) found = bar;
  }
  return found;
}

export function returnsFromCloses(bars: CloseBar[], asOfDay: number): ReturnReport {
  if (!Number.isInteger(asOfDay)) return EMPTY_RETURNS;
  const end = latestOnOrBefore(bars, asOfDay, Number.POSITIVE_INFINITY);
  if (!end) return EMPTY_RETURNS;
  const prior = latestOnOrBefore(bars, end.day - 1, end.day);
  const month = latestOnOrBefore(bars, shiftMonths(end.day, 1), end.day);
  const quarter = latestOnOrBefore(bars, shiftMonths(end.day, 3), end.day);
  const year = latestOnOrBefore(bars, shiftMonths(end.day, 12), end.day);
  return {
    lastClose: end.close,
    dailyChange: prior ? Math.round(end.close - prior.close) : null,
    dailyPercent: prior ? changePercent(end.close, prior.close) : null,
    monthPercent: month ? changePercent(end.close, month.close) : null,
    quarterPercent: quarter ? changePercent(end.close, quarter.close) : null,
    yearPercent: year ? changePercent(end.close, year.close) : null,
  };
}
