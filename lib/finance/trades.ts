import { amountInRial, type PriceUnit } from "@/lib/finance/prices/unit";

export type TradeSide = "buy" | "sell";

export type TradeLot = {
  side: TradeSide;
  quantity: number;
  price: number | null;
  fee: number;
  tradedOn: string;
};

export type Position = {
  quantity: number;
  avgBuyPrice: number | null;
  acquiredOn: string | null;
};

const dust = 1e-9;

/** Money added to the holding. A buy is positive. A sell is negative. */
export function moneyIn(lot: Pick<TradeLot, "side" | "quantity" | "price" | "fee">): number | null {
  if (lot.price == null || !Number.isFinite(lot.price) || !(lot.quantity > 0)) return null;
  const fee = Number.isFinite(lot.fee) && lot.fee > 0 ? lot.fee : 0;
  if (lot.side === "buy") return lot.quantity * lot.price + fee;
  return -(lot.quantity * lot.price - fee);
}

export function canSell(held: number, quantity: number): boolean {
  return quantity > 0 && quantity <= held + dust;
}

/**
 * Average-cost position. Buy fees enter the cost. Sell fees do not change the remaining average.
 * The database trigger uses the same rules.
 */
export function positionFromTrades(lots: TradeLot[]): Position {
  const ordered = [...lots].sort((left, right) => left.tradedOn.localeCompare(right.tradedOn));
  let quantity = 0;
  let cost = 0;
  let known = true;
  let acquiredOn: string | null = null;

  for (const lot of ordered) {
    if (!(lot.quantity > 0)) continue;
    if (lot.side === "buy") {
      if (lot.price == null) known = false;
      if (known && lot.price != null) cost += lot.quantity * lot.price + (lot.fee > 0 ? lot.fee : 0);
      quantity += lot.quantity;
      if (acquiredOn == null || lot.tradedOn < acquiredOn) acquiredOn = lot.tradedOn;
      continue;
    }
    if (!canSell(quantity, lot.quantity)) {
      throw new Error("oversell");
    }
    if (known && quantity > 0) cost -= (cost / quantity) * lot.quantity;
    quantity -= lot.quantity;
    if (quantity <= dust) {
      quantity = 0;
      cost = 0;
      known = true;
    }
  }

  return {
    quantity,
    avgBuyPrice: quantity > 0 && known ? cost / quantity : null,
    acquiredOn: quantity > 0 ? acquiredOn : null,
  };
}

export type WeekTrade = {
  assetId: string | null;
  cashAssetId: string | null;
  side: TradeSide;
  quantity: number;
  price: number | null;
  fee: number;
  unit: PriceUnit;
};

/** Net rial added to each asset. Cash that settled the trade receives the opposite amount. */
export function weekFlowAmounts(trades: WeekTrade[], usdRial: number | null): Map<string, number> {
  const amounts = new Map<string, number>();
  for (const trade of trades) {
    if (!trade.assetId) continue;
    const native = moneyIn(trade);
    if (native == null) continue;
    const rial = amountInRial(native, trade.unit, usdRial);
    if (rial == null) continue;
    amounts.set(trade.assetId, (amounts.get(trade.assetId) ?? 0) + rial);
    if (trade.cashAssetId) {
      amounts.set(trade.cashAssetId, (amounts.get(trade.cashAssetId) ?? 0) - rial);
    }
  }
  return amounts;
}
