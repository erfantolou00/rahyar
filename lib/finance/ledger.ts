import type { AccountKind, AssetType } from "@/lib/finance/types";
import type { PriceUnit } from "@/lib/finance/prices/unit";

export const ledgerAssetTypes = [
  "stock",
  "fund",
  "gold",
  "coin",
  "usd",
  "crypto",
  "cash",
] as const;

export type LedgerAssetType = (typeof ledgerAssetTypes)[number];

export const transactionOrigins = ["opening", "manual", "confirmed"] as const;

export type TransactionOrigin = (typeof transactionOrigins)[number];

const dust = 1e-9;

export function isLedgerAsset(type: string): type is LedgerAssetType {
  return (ledgerAssetTypes as readonly string[]).includes(type);
}

export function isCashAsset(type: string): boolean {
  return type === "cash" || type === "usd";
}

export function accountKindFor(type: AssetType, currency: PriceUnit): AccountKind {
  if (type === "crypto") return "wallet";
  if (type === "gold" || type === "coin") return "bullion";
  if (type === "usd" || currency === "usd") return "fx";
  return "brokerage";
}

export function defaultAccountName(kind: AccountKind, currency: PriceUnit): string {
  if (kind === "brokerage") return currency === "usd" ? "کارگزاری دلاری" : "کارگزاری";
  if (kind === "bullion") return currency === "usd" ? "طلای دلاری" : "طلا و سکه";
  if (kind === "fx") return currency === "rial" ? "صرافی ریالی" : "ارز و دلار";
  return currency === "usd" ? "کیف بیت‌کوین" : "کیف ریالی";
}

export type PositionDelta = {
  side: "buy" | "sell";
  quantity: number;
  price: number | null;
  fee: number;
};

export type PositionState = {
  quantity: number;
  avgBuyPrice: number | null;
};

/** Account-level average cost. Buy fees enter the cost. A sell keeps the remaining average. */
export function applyPositionDelta(position: PositionState, change: PositionDelta): PositionState {
  if (!(change.quantity > 0)) return position;
  if (change.side === "sell") {
    if (change.quantity > position.quantity + dust) throw new Error("oversell");
    const quantity = position.quantity - change.quantity;
    if (quantity <= dust) return { quantity: 0, avgBuyPrice: null };
    return { quantity, avgBuyPrice: position.avgBuyPrice };
  }

  const known = !(position.quantity > 0 && position.avgBuyPrice == null) && change.price != null;
  const quantity = position.quantity + change.quantity;
  if (!known || !(quantity > 0) || change.price == null) return { quantity, avgBuyPrice: null };
  const fee = change.fee > 0 ? change.fee : 0;
  const cost = position.quantity * (position.avgBuyPrice ?? 0) + change.quantity * change.price + fee;
  return { quantity, avgBuyPrice: cost / quantity };
}
