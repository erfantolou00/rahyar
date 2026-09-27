import { toNumber } from "@/lib/finance/format";
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
    const quote = quotes.get(priceKey(asset.type, asset.symbol));
    const marketPrice = quote ? toNumber(quote.price) : null;
    const cost =
      asset.avg_buy_price == null ? null : toNumber(asset.avg_buy_price);
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
    holding.weight = totalValue > 0 ? (holding.value / totalValue) * 100 : null;
  }

  const valueByType = new Map<AssetType, number>();
  for (const holding of holdings) {
    valueByType.set(holding.type, (valueByType.get(holding.type) ?? 0) + holding.value);
  }

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
