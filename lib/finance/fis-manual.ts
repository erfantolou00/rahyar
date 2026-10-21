import { parseOptionalNumber } from "@/lib/finance/parse";
import type { StatementFigures } from "@/lib/finance/codal/parse";
import type { Json } from "@/lib/finance/types";

export type ManualSheet = {
  months: number | null;
  price: number | null;
  sales: number | null;
  priorPeriodSales: number | null;
  operatingProfit: number | null;
  otherOperatingIncome: number | null;
  netIncome: number | null;
  periodEps: number | null;
  cogs: number | null;
  totalAssets: number | null;
  receivables: number | null;
  inventory: number | null;
  priorInventory: number | null;
  retainedEarnings: number | null;
  ttmEps: number | null;
  dividendRatioPercent: number | null;
  priorMonths: number | null;
  priorSales: number | null;
  priorOperatingProfit: number | null;
  fiscalYearScore: 0 | 3 | 5 | null;
};

const amountKeys = [
  "price",
  "sales",
  "priorPeriodSales",
  "operatingProfit",
  "otherOperatingIncome",
  "netIncome",
  "periodEps",
  "cogs",
  "totalAssets",
  "receivables",
  "inventory",
  "priorInventory",
  "retainedEarnings",
  "ttmEps",
  "priorSales",
  "priorOperatingProfit",
] as const;

export function emptyStatement(): StatementFigures {
  return {
    sales: null,
    priorPeriodSales: null,
    netIncome: 0,
    equity: null,
    periodEps: null,
    operatingProfit: null,
    otherOperatingIncome: null,
    totalAssets: null,
    receivables: null,
    inventory: null,
    priorInventory: null,
    cogs: null,
    retainedEarnings: null,
  };
}

export function sheetHasNumbers(sheet: ManualSheet | null): boolean {
  if (!sheet) return false;
  return Object.values(sheet).some((value) => value != null);
}

export function applyManualSheet(base: StatementFigures | null, sheet: ManualSheet | null): StatementFigures | null {
  if (!sheetHasNumbers(sheet) || !sheet) return base;
  const current = base ?? emptyStatement();
  const pick = (manual: number | null, value: number | null) => (manual != null ? manual : value);
  return {
    sales: pick(sheet.sales, current.sales),
    priorPeriodSales: pick(sheet.priorPeriodSales, current.priorPeriodSales),
    netIncome: sheet.netIncome ?? current.netIncome,
    equity: current.equity,
    periodEps: pick(sheet.periodEps, current.periodEps),
    operatingProfit: pick(sheet.operatingProfit, current.operatingProfit),
    otherOperatingIncome: pick(sheet.otherOperatingIncome, current.otherOperatingIncome),
    totalAssets: pick(sheet.totalAssets, current.totalAssets),
    receivables: pick(sheet.receivables, current.receivables),
    inventory: pick(sheet.inventory, current.inventory),
    priorInventory: pick(sheet.priorInventory, current.priorInventory),
    cogs: pick(sheet.cogs, current.cogs),
    retainedEarnings: pick(sheet.retainedEarnings, current.retainedEarnings),
  };
}

function amount(formData: FormData, key: string, min: number, max: number): number | null | undefined {
  const text = String(formData.get(key) ?? "").trim();
  if (!text) return null;
  return parseOptionalNumber(text, { min, max });
}

function monthsOf(formData: FormData, key: string): number | null | undefined {
  const text = String(formData.get(key) ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return parsed === 3 || parsed === 6 || parsed === 9 || parsed === 12 ? parsed : undefined;
}

export function readManualSheet(formData: FormData): ManualSheet | undefined {
  const months = monthsOf(formData, "months");
  const priorMonths = monthsOf(formData, "priorMonths");
  const fiscalText = String(formData.get("fiscalYearScore") ?? "").trim();
  const fiscal = fiscalText === "" ? null : fiscalText === "0" || fiscalText === "3" || fiscalText === "5" ? Number(fiscalText) as 0 | 3 | 5 : undefined;
  const dividend = amount(formData, "dividendRatioPercent", 0, 500);
  const price = amount(formData, "price", 0, 1e15);
  const values = Object.fromEntries(amountKeys.map((key) => [key, amount(formData, key, -1e15, 1e15)])) as Record<(typeof amountKeys)[number], number | null | undefined>;
  if (
    months === undefined
    || priorMonths === undefined
    || fiscal === undefined
    || dividend === undefined
    || price === undefined
    || amountKeys.some((key) => values[key] === undefined)
    || (price != null && !(price > 0))
  ) {
    return undefined;
  }
  return {
    months,
    priorMonths,
    fiscalYearScore: fiscal,
    dividendRatioPercent: dividend,
    price,
    sales: values.sales,
    priorPeriodSales: values.priorPeriodSales,
    operatingProfit: values.operatingProfit,
    otherOperatingIncome: values.otherOperatingIncome,
    netIncome: values.netIncome,
    periodEps: values.periodEps,
    cogs: values.cogs,
    totalAssets: values.totalAssets,
    receivables: values.receivables,
    inventory: values.inventory,
    priorInventory: values.priorInventory,
    retainedEarnings: values.retainedEarnings,
    ttmEps: values.ttmEps,
    priorSales: values.priorSales,
    priorOperatingProfit: values.priorOperatingProfit,
  };
}

export function parseStoredSheet(value: Json | undefined): ManualSheet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Json | undefined>;
  const numberOrNull = (key: string) => (typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] : null);
  const months = numberOrNull("months");
  const priorMonths = numberOrNull("priorMonths");
  const fiscal = numberOrNull("fiscalYearScore");
  const sheet: ManualSheet = {
    months: months === 3 || months === 6 || months === 9 || months === 12 ? months : null,
    priorMonths: priorMonths === 3 || priorMonths === 6 || priorMonths === 9 || priorMonths === 12 ? priorMonths : null,
    fiscalYearScore: fiscal === 0 || fiscal === 3 || fiscal === 5 ? fiscal : null,
    price: numberOrNull("price"),
    sales: numberOrNull("sales"),
    priorPeriodSales: numberOrNull("priorPeriodSales"),
    operatingProfit: numberOrNull("operatingProfit"),
    otherOperatingIncome: numberOrNull("otherOperatingIncome"),
    netIncome: numberOrNull("netIncome"),
    periodEps: numberOrNull("periodEps"),
    cogs: numberOrNull("cogs"),
    totalAssets: numberOrNull("totalAssets"),
    receivables: numberOrNull("receivables"),
    inventory: numberOrNull("inventory"),
    priorInventory: numberOrNull("priorInventory"),
    retainedEarnings: numberOrNull("retainedEarnings"),
    ttmEps: numberOrNull("ttmEps"),
    dividendRatioPercent: numberOrNull("dividendRatioPercent"),
    priorSales: numberOrNull("priorSales"),
    priorOperatingProfit: numberOrNull("priorOperatingProfit"),
  };
  return sheetHasNumbers(sheet) ? sheet : null;
}

export function storedSheet(sheet: ManualSheet): Json {
  const payload: { [key: string]: Json } = {};
  for (const [key, value] of Object.entries(sheet)) {
    if (typeof value === "number") payload[key] = value;
  }
  return payload;
}
