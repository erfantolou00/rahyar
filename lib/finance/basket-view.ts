import { assetTypeLabels } from "@/lib/finance/labels";
import { formatMoney, formatNumber, formatPercent } from "@/lib/finance/format";
import type { AssetFormValues, BasketColumnKey } from "@/lib/finance/basket-fields";
import type { BasketRow, BasketSummary } from "@/lib/finance/portfolio";

export type ValueTone = "up" | "down" | "flat" | "empty";

export type PresentedRow = {
  id: string;
  values: AssetFormValues;
  cells: Record<BasketColumnKey, string>;
  tone: ValueTone;
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

function presentRow(row: BasketRow): PresentedRow {
  return {
    id: row.id,
    tone: toneOf(row.absolute),
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
