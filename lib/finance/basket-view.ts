import { priceAge } from "@/lib/finance/prices/age";
import { assetTypeLabels } from "@/lib/finance/labels";
import { formatMoney, formatNumber, formatPercent } from "@/lib/finance/format";
import type { AssetFormValues, BasketColumnKey } from "@/lib/finance/basket-fields";
import type { BasketRow, BasketSummary } from "@/lib/finance/portfolio";
import { latestQuote, liveSymbols, type LiveSymbol } from "@/lib/finance/prices/match";
import type { Price } from "@/lib/finance/types";

export type ValueTone = "up" | "down" | "flat" | "empty";

export type PresentedRow = {
  id: string;
  values: AssetFormValues;
  cells: Record<BasketColumnKey, string>;
  tone: ValueTone;
  updatedLabel: string | null;
  stale: boolean;
};

export type PresentedMark = {
  title: string;
  price: string;
  updatedLabel: string;
  stale: boolean;
};

const markTitles: Record<LiveSymbol, string> = {
  USD: "دلار",
  GOLD18: "طلای ۱۸ عیار",
  BTC: "بیت‌کوین",
};

export type PresentedBasket = {
  rows: PresentedRow[];
  totalValue: string;
  totalAbsolute: string;
  totalPercent: string;
  totalTone: ValueTone;
};

function money(value: number | null): string {
  if (value == null) return "—";
  return formatMoney(value);
}

function grouped(value: number | null): string {
  if (value == null) return "";
  return formatNumber(value, 0);
}

function toneOf(value: number | null): ValueTone {
  if (value == null) return "empty";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

export function presentBasket(summary: BasketSummary): PresentedBasket {
  return {
    totalValue: money(summary.totalValue),
    totalAbsolute: money(summary.totalAbsolute),
    totalPercent: summary.totalPercent == null ? "—" : formatPercent(summary.totalPercent),
    totalTone: toneOf(summary.totalAbsolute),
    rows: summary.rows.map((row) => presentRow(row)),
  };
}

export function presentMarks(prices: Price[], now = Date.now()): PresentedMark[] {
  return liveSymbols.map((symbol) => {
    const quote = latestQuote(prices, symbol);
    if (!quote) {
      return {
        title: markTitles[symbol],
        price: "—",
        updatedLabel: "هنوز قیمتی دریافت نشده",
        stale: true,
      };
    }
    const age = priceAge(quote.timestamp, now);
    return {
      title: markTitles[symbol],
      price: formatMoney(toNumberPrice(quote.price)),
      updatedLabel: age.label,
      stale: age.stale,
    };
  });
}

function toNumberPrice(value: Price["price"]): number {
  return typeof value === "number" ? value : Number(value);
}

function presentRow(row: BasketRow): PresentedRow {
  const age = row.quotedAt ? priceAge(row.quotedAt) : null;
  const updatedLabel =
    row.priceOrigin === "live" && age
      ? age.label
      : row.priceOrigin === "manual"
        ? "قیمت دستی"
        : null;

  return {
    id: row.id,
    tone: toneOf(row.absolute),
    updatedLabel,
    stale: row.priceOrigin === "live" && Boolean(age?.stale),
    values: {
      type: row.type,
      symbol: row.name,
      quantity: grouped(row.quantity),
      avg_buy_price: grouped(row.avgBuyPrice),
      manual_value: grouped(row.currentPrice),
    },
    cells: {
      name: row.name,
      type: assetTypeLabels[row.type],
      quantity: formatNumber(row.quantity, 0),
      avgBuyPrice: money(row.avgBuyPrice),
      currentPrice: money(row.currentPrice),
      currentValue: money(row.currentValue),
      absolute: money(row.absolute),
      percent: row.percent == null ? "—" : formatPercent(row.percent),
      weight: row.weight == null ? "—" : formatPercent(row.weight),
    },
  };
}
