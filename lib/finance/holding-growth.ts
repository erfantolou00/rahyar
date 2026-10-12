import type { TransactionType } from "@/lib/finance/types";

export type GrowthPoint = {
  at: string;
  value: number;
};

export type GrowthTradeInput = {
  at: string;
  type: TransactionType;
  qty: number;
  price: number;
};

export const growthRanges = [
  { id: "week", label: "۷ روز", days: 7 },
  { id: "month", label: "۱ ماه", days: 30 },
  { id: "quarter", label: "۳ ماه", days: 90 },
  { id: "year", label: "۱ سال", days: 365 },
  { id: "all", label: "کل دوره", days: null },
] as const;

export type GrowthRangeId = (typeof growthRanges)[number]["id"];

export type GrowthSlice = {
  points: GrowthPoint[];
  startValue: number | null;
  endValue: number | null;
  change: number | null;
  changePercent: number | null;
};

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dayKey(value: string): string {
  const trimmed = value.trim();
  if (dayPattern.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function shiftDays(day: string, days: number): string {
  const match = dayPattern.exec(day);
  if (!match) return day;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function todayKey(now = Date.now()): string {
  return dayKey(new Date(now).toISOString());
}

function signedQty(type: TransactionType, qty: number): number {
  const amount = Math.abs(qty);
  if (type === "buy" || type === "deposit") return amount;
  if (type === "sell" || type === "withdraw") return -amount;
  return 0;
}

export function buildHoldingSeries(input: {
  quantity: number;
  trades: GrowthTradeInput[];
  quotes: { at: string; price: number }[];
}): { basis: "trades" | "quantity"; points: GrowthPoint[] } {
  const quoteByDay = new Map<string, number>();
  const quotes = [...input.quotes].sort((left, right) => dayKey(left.at).localeCompare(dayKey(right.at)));
  for (const quote of quotes) {
    if (!(quote.price > 0)) continue;
    quoteByDay.set(dayKey(quote.at), quote.price);
  }

  const trades = [...input.trades].sort((left, right) => dayKey(left.at).localeCompare(dayKey(right.at)));
  if (trades.length === 0) {
    if (!(input.quantity > 0)) return { basis: "quantity", points: [] };
    let lastPrice: number | null = null;
    const points: GrowthPoint[] = [];
    for (const day of [...quoteByDay.keys()].sort()) {
      const price = quoteByDay.get(day);
      if (price != null) lastPrice = price;
      if (lastPrice == null) continue;
      points.push({ at: day, value: input.quantity * lastPrice });
    }
    return { basis: "quantity", points };
  }

  const tradesByDay = new Map<string, GrowthTradeInput[]>();
  for (const trade of trades) {
    const day = dayKey(trade.at);
    const list = tradesByDay.get(day) ?? [];
    list.push(trade);
    tradesByDay.set(day, list);
  }

  const days = [...new Set([...quoteByDay.keys(), ...tradesByDay.keys()])].sort();
  let qty = 0;
  let lastPrice: number | null = null;
  let sawPosition = false;
  let closed = false;
  const points: GrowthPoint[] = [];

  for (const day of days) {
    for (const trade of tradesByDay.get(day) ?? []) {
      qty += signedQty(trade.type, trade.qty);
      if (trade.price > 0) lastPrice = trade.price;
    }
    const quote = quoteByDay.get(day);
    if (quote != null) lastPrice = quote;
    if (lastPrice == null) continue;

    if (qty > 0) {
      sawPosition = true;
      closed = false;
      points.push({ at: day, value: qty * lastPrice });
      continue;
    }

    if (sawPosition && !closed) {
      points.push({ at: day, value: 0 });
      closed = true;
    }
  }

  return { basis: "trades", points };
}

export function sliceGrowth(points: GrowthPoint[], days: number | null, today: string): GrowthSlice {
  const empty: GrowthSlice = {
    points: [],
    startValue: null,
    endValue: null,
    change: null,
    changePercent: null,
  };
  if (points.length === 0) return empty;

  let selected: GrowthPoint[];
  if (days == null) {
    selected = points.filter((point) => point.at <= today);
  } else {
    const start = shiftDays(today, days);
    const inside = points.filter((point) => point.at >= start && point.at <= today);
    const prior = [...points].reverse().find((point) => point.at < start);
    if (prior && inside[0]?.at !== start) {
      const carried = { at: start > today ? today : start, value: prior.value };
      selected = inside.length === 0 && start < today ? [carried, { at: today, value: prior.value }] : [carried, ...inside];
    } else {
      selected = inside;
    }
  }

  if (selected.length === 0) return empty;
  const startValue = selected[0]?.value ?? null;
  const endValue = selected[selected.length - 1]?.value ?? null;
  if (startValue == null || endValue == null) return empty;
  const change = endValue - startValue;
  const changePercent = startValue > 0 ? Math.round((change / startValue) * 10000) / 100 : null;
  return { points: selected, startValue, endValue, change, changePercent };
}
