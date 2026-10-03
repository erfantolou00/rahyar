import { readSalesTrend } from "@/lib/finance/codal/parse";
import { readMarketReport } from "@/lib/finance/prices/market-report";
import { priceAge } from "@/lib/finance/prices/age";
import { assetTypeLabels } from "@/lib/finance/labels";
import { formatDollar, formatMoney, formatNumber, formatPercent, formatQuantity, plainNumber, toNumber } from "@/lib/finance/format";
import { btcInUsdt } from "@/lib/finance/prices/btc";
import type { AssetFormValues, BasketColumnKey } from "@/lib/finance/basket-fields";
import type { BasketRow, BasketSummary } from "@/lib/finance/portfolio";
import { latestQuote, liveSymbols, type LiveSymbol } from "@/lib/finance/prices/match";
import type { Numeric, Price, StockFundamentals } from "@/lib/finance/types";

export type ValueTone = "up" | "down" | "flat" | "empty";

export type PresentedRow = {
  id: string;
  values: AssetFormValues;
  cells: Record<BasketColumnKey, string>;
  sort: Record<BasketColumnKey, string | number | null>;
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

export type PresentedReport = {
  daily: string;
  month: string;
  quarter: string;
  year: string;
  dailyTone: ValueTone;
  monthTone: ValueTone;
  quarterTone: ValueTone;
  yearTone: ValueTone;
  dailyChange: string | null;
  extras: { label: string; value: string }[];
  sourceLabel: string;
};

export type PresentedFundamental = {
  symbol: string;
  pe: string;
  eps: string;
  roe: string;
  profitMargin: string;
  sales: { period: string; sales: string }[];
  letter: string | null;
  published: string | null;
  adjusted: boolean;
  shapeError: string | null;
  fetchedLabel: string;
  report: PresentedReport | null;
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

function metric(value: Numeric | null | undefined, digits = 2): string {
  if (value == null || value === "") return "—";
  const parsed = toNumber(value);
  if (!Number.isFinite(parsed)) return "—";
  return formatNumber(parsed, digits);
}

function signedPercent(value: number | null): string {
  if (value == null) return "—";
  const text = formatPercent(value);
  return value > 0 ? `+${text}` : text;
}

function reportSourceLabel(source: string): string {
  const history = source.includes("tsetmc");
  const rahavard = source.includes("rahavard");
  if (history && rahavard) return "بازده از قیمت‌های پایانی؛ جزئیات از رهاورد ۳۶۵";
  if (history) return "بازده از قیمت‌های پایانی بورس";
  if (rahavard) return "از رهاورد ۳۶۵";
  return "گزارش قیمت هنوز کامل نشده است";
}

function presentReport(value: StockFundamentals["market_report"]): PresentedReport | null {
  const report = readMarketReport(value);
  if (!report) return null;
  const extras = [
    report.industry ? { label: "صنعت", value: report.industry } : null,
    report.state ? { label: "وضعیت", value: report.state } : null,
    report.marketCap != null ? { label: "ارزش بازار", value: formatMoney(report.marketCap) } : null,
    report.freeFloatPercent != null ? { label: "شناوری", value: formatPercent(report.freeFloatPercent) } : null,
    report.pb != null ? { label: "P/B", value: formatNumber(report.pb, 2) } : null,
    report.dps != null ? { label: "سود نقدی", value: formatNumber(report.dps, 0) } : null,
    report.volume != null ? { label: "حجم", value: formatNumber(report.volume, 0) } : null,
    report.tradeValue != null ? { label: "ارزش معاملات", value: formatMoney(report.tradeValue) } : null,
  ].filter((item): item is { label: string; value: string } => item != null);
  const hasFigure =
    report.lastPrice != null ||
    report.dailyPercent != null ||
    report.monthPercent != null ||
    report.quarterPercent != null ||
    report.yearPercent != null;
  if (!hasFigure && extras.length === 0) return null;
  return {
    daily: signedPercent(report.dailyPercent),
    month: signedPercent(report.monthPercent),
    quarter: signedPercent(report.quarterPercent),
    year: signedPercent(report.yearPercent),
    dailyTone: toneOf(report.dailyPercent),
    monthTone: toneOf(report.monthPercent),
    quarterTone: toneOf(report.quarterPercent),
    yearTone: toneOf(report.yearPercent),
    dailyChange: report.dailyChange == null ? null : formatMoney(report.dailyChange),
    extras,
    sourceLabel: reportSourceLabel(report.source),
  };
}

export function presentFundamentals(
  symbols: string[],
  rows: StockFundamentals[],
  now = Date.now(),
): PresentedFundamental[] {
  return symbols.map((symbol) => {
    const row = rows.find((item) => item.symbol.trim() === symbol.trim());
    if (!row) {
      return {
        symbol,
        pe: "—",
        eps: "—",
        roe: "—",
        profitMargin: "—",
        sales: [],
        letter: null,
        published: null,
        adjusted: false,
        shapeError: null,
        fetchedLabel: "هنوز خوانده نشده",
        report: null,
      };
    }
    const age = priceAge(row.fetched_at, now);
    return {
      symbol,
      pe: metric(row.pe),
      eps: metric(row.eps, 0),
      roe: row.roe == null ? "—" : formatPercent(toNumber(row.roe)),
      profitMargin: row.profit_margin == null ? "—" : formatPercent(toNumber(row.profit_margin)),
      sales: readSalesTrend(row.sales_trend).map((point) => ({
        period: point.period,
        sales: formatNumber(point.sales, 0),
      })),
      letter: row.latest_title,
      published: row.published_label,
      adjusted: row.adjusted,
      shapeError: row.shape_error,
      fetchedLabel: age.label,
      report: presentReport(row.market_report),
    };
  });
}

export function presentMarks(prices: Price[], now = Date.now()): PresentedMark[] {
  const usd = latestQuote(prices, "USD");
  const usdRial = usd ? toNumberPrice(usd.price) : null;
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
    const amount = toNumberPrice(quote.price);
    const shown = symbol === "BTC" ? btcInUsdt(amount, usdRial) : amount;
    return {
      title: markTitles[symbol],
      price: shown == null ? "—" : symbol === "BTC" ? formatDollar(shown) : formatMoney(shown),
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
  const unit = row.priceUnit === "usd" ? "usd" : "rial";
  const buy = row.displayAvgBuyPrice !== undefined ? row.displayAvgBuyPrice : row.avgBuyPrice;
  const current = row.displayCurrentPrice !== undefined ? row.displayCurrentPrice : row.currentPrice;
  const manual = row.manualPrice !== undefined ? row.manualPrice : null;

  return {
    id: row.id,
    tone: toneOf(row.absolute),
    updatedLabel,
    stale: row.priceOrigin === "live" && Boolean(age?.stale),
    values: {
      type: row.type,
      symbol: row.name,
      quantity: plainNumber(row.quantity),
      price_unit: unit,
      avg_buy_price: plainNumber(buy),
      manual_value: plainNumber(manual),
      allocation_class: row.allocationClass ?? row.type,
      allocation_class_source: row.allocationClassSource ?? "auto",
    },
    cells: {
      name: row.name,
      type: assetTypeLabels[row.type],
      class: classLabel(row),
      quantity: formatQuantity(row.quantity),
      avgBuyPrice: formatUnitPrice(buy, unit),
      currentPrice: formatUnitPrice(current, unit),
      currentValue: money(row.currentValue),
      absolute: money(row.absolute),
      percent: row.percent == null ? "—" : formatPercent(row.percent),
      weight: row.weight == null ? "—" : formatPercent(row.weight),
    },
    sort: {
      name: row.name,
      type: assetTypeLabels[row.type],
      class: classLabel(row),
      quantity: row.quantity,
      avgBuyPrice: buy,
      currentPrice: current,
      currentValue: row.currentValue,
      absolute: row.absolute,
      percent: row.percent,
      weight: row.weight,
    },
  };
}

function classLabel(row: BasketRow): string {
  const klass = assetTypeLabels[row.allocationClass ?? row.type];
  return row.allocationClassSource === "manual" ? `${klass} · دستی` : klass;
}

function formatUnitPrice(value: number | null, unit: "rial" | "usd"): string {
  if (value == null) return "—";
  return unit === "usd" ? formatDollar(value, 2) : formatMoney(value);
}
