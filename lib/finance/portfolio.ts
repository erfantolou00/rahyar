import { effectiveAllocationClass } from "@/lib/finance/allocation-class";
import { toNumber } from "@/lib/finance/format";
import { instrumentForAsset, latestQuote } from "@/lib/finance/prices/match";
import { amountInRial, quoteInUnit, type PriceUnit } from "@/lib/finance/prices/unit";
import type {
  Allocation,
  Asset,
  AssetType,
  HoldingSnapshot,
  PortfolioSnapshot,
  Price,
  TypeSnapshot,
} from "@/lib/finance/types";

function priceKey(type: string, symbol: string): string {
  return `${type}:${symbol.trim().toUpperCase()}`;
}

function marketUnitPrice(asset: Asset, quotes: Map<string, Price>, prices: Price[]): number | null {
  const usdRial = dollarRate(prices);
  const unit: PriceUnit = asset.price_unit === "usd" ? "usd" : "rial";
  if (asset.manual_value != null) {
    return amountInRial(toNumber(asset.manual_value), unit, usdRial);
  }
  const direct = quotes.get(priceKey(asset.type, asset.symbol));
  const instrument = instrumentForAsset(asset.type, asset.symbol);
  if (!direct && instrument) {
    const live = latestQuote(prices, instrument);
    if (live) {
      const inUnit = quoteInUnit(instrument, toNumber(live.price), unit, usdRial);
      return amountInRial(inUnit, unit, usdRial);
    }
  }
  if (direct) return toNumber(direct.price);
  return null;
}

function dollarRate(prices: Price[]): number | null {
  const usd = latestQuote(prices, "USD");
  return usd ? toNumber(usd.price) : null;
}

export function latestPrices(prices: Price[]): Map<string, Price> {
  const sorted = [...prices].sort(
    (left, right) =>
      new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  );
  const map = new Map<string, Price>();
  for (const price of sorted) {
    const key = priceKey(price.asset_type, price.symbol);
    if (!map.has(key)) map.set(key, price);
  }
  return map;
}

export function buildPortfolio(
  assets: Asset[],
  prices: Price[],
  allocations: Allocation[],
): PortfolioSnapshot {
  const quotes = latestPrices(prices);
  const holdings: HoldingSnapshot[] = assets.map((asset) => {
    const marketPrice = marketUnitPrice(asset, quotes, prices);
    const unitBasis: PriceUnit = asset.price_unit === "usd" ? "usd" : "rial";
    const cost =
      asset.avg_buy_price == null
        ? null
        : amountInRial(toNumber(asset.avg_buy_price), unitBasis, dollarRate(prices));
    const unit = marketPrice ?? cost ?? 0;
    const quantity = toNumber(asset.quantity);
    return {
      id: asset.id,
      type: asset.type,
      symbol: asset.symbol,
      quantity,
      price: marketPrice,
      usedCostBasis: marketPrice == null && cost != null,
      value: quantity * unit,
      weight: null,
    };
  });

  const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
  for (const holding of holdings) {
    holding.weight = weightPercent(holding.value, totalValue);
  }

  const valueByType = new Map<AssetType, number>();
  assets.forEach((asset, index) => {
    const holding = holdings[index];
    if (!holding) return;
    const exposure = effectiveAllocationClass(asset);
    valueByType.set(exposure, (valueByType.get(exposure) ?? 0) + holding.value);
  });

  const openAllocations = allocations.filter((row) => row.valid_to == null);
  const bandByType = new Map(openAllocations.map((row) => [row.asset_type, row]));
  const types = new Set<AssetType>([...valueByType.keys(), ...bandByType.keys()]);

  const byType: TypeSnapshot[] = [...types]
    .map((type) => {
      const value = valueByType.get(type) ?? 0;
      const weight = totalValue > 0 ? (value / totalValue) * 100 : 0;
      const band = bandByType.get(type);
      const minPercent = band ? toNumber(band.min_percent) : null;
      const maxPercent = band ? toNumber(band.max_percent) : null;
      let status: TypeSnapshot["status"] = "unset";
      if (minPercent != null && maxPercent != null) {
        if (weight < minPercent) status = "below";
        else if (weight > maxPercent) status = "above";
        else status = "inside";
      }
      return { type, value, weight, minPercent, maxPercent, status };
    })
    .sort((left, right) => right.value - left.value);

  return { totalValue, holdings, byType };
}

export type PositionNumbers = {
  quantity: number;
  avgBuyPrice: number | null;
  currentPrice: number | null;
};

export type ProfitLoss = {
  cost: number | null;
  absolute: number | null;
  percent: number | null;
};

export type BasketPosition = PositionNumbers & {
  id: string;
  name: string;
  type: AssetType;
  priceUnit?: PriceUnit;
  displayAvgBuyPrice?: number | null;
  displayCurrentPrice?: number | null;
  manualPrice?: number | null;
  quotedAt?: string | null;
  priceOrigin?: "live" | "manual" | "none";
  allocationClass?: AssetType;
  allocationClassSource?: "auto" | "manual";
};

export type BasketRow = BasketPosition & ProfitLoss & {
  currentValue: number | null;
  weight: number | null;
  quotedAt: string | null;
  priceOrigin: "live" | "manual" | "none";
};

export type BasketSummary = {
  rows: BasketRow[];
  totalValue: number;
  totalCost: number | null;
  totalAbsolute: number | null;
  totalPercent: number | null;
};

function finite(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

export function costBasis(quantity: number, avgBuyPrice: number | null): number | null {
  const qty = finite(quantity);
  const price = finite(avgBuyPrice);
  if (qty == null || price == null || qty < 0 || price < 0) return null;
  return qty * price;
}

export function positionValue(quantity: number, unitPrice: number | null): number | null {
  const qty = finite(quantity);
  const price = finite(unitPrice);
  if (qty == null || price == null || qty < 0 || price < 0) return null;
  return qty * price;
}

export function profitAndLoss(position: PositionNumbers): ProfitLoss {
  const cost = costBasis(position.quantity, position.avgBuyPrice);
  const current = positionValue(position.quantity, position.currentPrice);
  if (current == null || cost == null) {
    return { cost, absolute: null, percent: null };
  }
  const absolute = current - cost;
  const percent = cost === 0 ? null : (absolute / cost) * 100;
  return { cost, absolute, percent };
}

export function weightPercent(value: number | null, totalValue: number): number | null {
  const amount = finite(value);
  const total = finite(totalValue);
  if (amount == null || amount < 0 || total == null || total <= 0) return null;
  return (amount / total) * 100;
}

export function buildBasket(positions: BasketPosition[]): BasketSummary {
  const valued = positions.map((position) => {
    const currentValue = positionValue(position.quantity, position.currentPrice);
    return {
      ...position,
      currentValue,
      quotedAt: position.quotedAt ?? null,
      priceOrigin: position.priceOrigin ?? "none",
      ...profitAndLoss(position),
    };
  });

  const totalValue = valued.reduce(
    (sum, row) => sum + (row.currentValue ?? 0),
    0,
  );

  const rows: BasketRow[] = valued.map((row) => ({
    ...row,
    weight: row.currentValue == null ? null : weightPercent(row.currentValue, totalValue),
  }));

  const priced = rows.filter((row) => row.cost != null && row.absolute != null);
  const totalCost =
    priced.length === 0 ? null : priced.reduce((sum, row) => sum + (row.cost ?? 0), 0);
  const totalAbsolute =
    priced.length === 0 ? null : priced.reduce((sum, row) => sum + (row.absolute ?? 0), 0);
  const totalPercent =
    totalCost == null || totalAbsolute == null || totalCost === 0
      ? null
      : (totalAbsolute / totalCost) * 100;

  return { rows, totalValue, totalCost, totalAbsolute, totalPercent };
}
