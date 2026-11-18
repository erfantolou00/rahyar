export type TradeErrorCode = "invalid" | "save" | "oversell" | "ledger" | "cash" | "empty";

export function tradeErrorCode(error: { code?: string; message?: string }): TradeErrorCode {
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("oversell")) return "oversell";
  if (message === "empty") return "empty";
  if (message.includes("cash")) return "cash";
  if (message.includes("ledger") || message.includes("currency")) return "ledger";
  if (error.code === "22023" || message === "invalid") return "invalid";
  return "save";
}
