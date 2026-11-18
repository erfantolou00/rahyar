import type { TransactionType } from "@/lib/finance/types";
import { cn } from "cn";

const sideClass: Record<TransactionType, string> = {
  buy: "bg-ok/15 text-ok",
  deposit: "bg-ok/15 text-ok",
  sell: "bg-danger/15 text-danger",
  withdraw: "bg-warn/15 text-warn",
  transfer: "bg-muted text-foreground",
  adjust: "bg-muted text-foreground",
};

export function SideBadge({ side, label }: { side: TransactionType; label: string }) {
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", sideClass[side])}>{label}</span>;
}
