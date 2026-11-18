export const ledgerAssetTypes = ["stock", "fund", "gold", "coin", "crypto", "usd", "cash"] as const;

export type HoldingMove = "add" | "remove" | "average";

export function isLedgerAsset(type: string): boolean {
  return (ledgerAssetTypes as readonly string[]).includes(type);
}

export function isCashAsset(type: string): boolean {
  return type === "cash" || type === "usd";
}

export type HoldingProjection =
  | { ok: true; quantity: number; average: number | null }
  | { ok: false; reason: "missing" | "oversell" | "empty" };

export function projectHoldingMove(input: {
  move: HoldingMove;
  quantity: number;
  average: number | null;
  amount: number | null;
  price: number | null;
}): HoldingProjection {
  if (input.move === "average") {
    if (!(input.quantity > 0)) return { ok: false, reason: "empty" };
    if (input.price == null || input.price < 0) return { ok: false, reason: "missing" };
    return { ok: true, quantity: input.quantity, average: input.price };
  }

  if (input.amount == null || !(input.amount > 0)) return { ok: false, reason: "missing" };

  if (input.move === "remove") {
    if (input.amount > input.quantity) return { ok: false, reason: "oversell" };
    return { ok: true, quantity: input.quantity - input.amount, average: input.average };
  }

  if (input.price == null || input.price < 0) return { ok: false, reason: "missing" };
  const quantity = input.quantity + input.amount;
  if (!(input.quantity > 0)) return { ok: true, quantity, average: input.price };
  if (input.average == null) return { ok: true, quantity, average: null };
  return {
    ok: true,
    quantity,
    average: (input.quantity * input.average + input.amount * input.price) / quantity,
  };
}
