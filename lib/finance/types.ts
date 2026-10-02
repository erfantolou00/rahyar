export const assetTypes = [
  "stock",
  "gold",
  "coin",
  "usd",
  "crypto",
  "cash",
  "fund",
  "loan",
  "real_estate",
] as const;

export const transactionTypes = ["buy", "sell", "deposit", "withdraw"] as const;

export const reportTypes = ["daily", "weekly", "event", "period"] as const;

export const chatRoles = ["user", "assistant", "system"] as const;

export type AssetType = (typeof assetTypes)[number];
export type TransactionType = (typeof transactionTypes)[number];
export type ReportType = (typeof reportTypes)[number];
export type ChatRole = (typeof chatRoles)[number];

export type Numeric = number | string;

export type PriceUnit = "rial" | "usd";

export type Asset = {
  id: string;
  user_id: string;
  type: AssetType;
  symbol: string;
  quantity: Numeric;
  avg_buy_price: Numeric | null;
  target_min_weight: Numeric | null;
  target_max_weight: Numeric | null;
  risk_level: number | null;
  manual_value: Numeric | null;
  price_unit: PriceUnit;
  allocation_class: AssetType;
  allocation_class_source: "auto" | "manual";
  created_at: string;
  updated_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  asset_id: string;
  type: TransactionType;
  qty: Numeric;
  price: Numeric;
  date: string;
  note: string | null;
};

export type Price = {
  id: string;
  user_id: string;
  asset_type: AssetType;
  symbol: string;
  price: Numeric;
  source: string;
  timestamp: string;
};

export type Allocation = {
  id: string;
  user_id: string;
  asset_type: AssetType;
  min_percent: Numeric;
  max_percent: Numeric;
  formula_version: string;
  valid_from: string;
  valid_to: string | null;
};

export const alertKinds = ["rule", "allocation_deviation"] as const;

export type AlertKind = (typeof alertKinds)[number];

export const notifyFrequencies = ["immediate", "daily", "weekly", "off"] as const;

export type NotifyFrequency = (typeof notifyFrequencies)[number];

export function isAlertKind(value: string): value is AlertKind {
  return alertKinds.some((kind) => kind === value);
}

export function isNotifyFrequency(value: string): value is NotifyFrequency {
  return notifyFrequencies.some((frequency) => frequency === value);
}

export type Alert = {
  id: string;
  user_id: string;
  rule: string;
  threshold: Numeric;
  channel: string;
  is_active: boolean;
  frequency: string;
  kind: AlertKind;
  message: string | null;
  asset_type: AssetType | null;
  created_at: string;
  sent: boolean;
  sent_at: string | null;
};

export type UserSettings = {
  user_id: string;
  telegram_chat_id: string | null;
  bale_chat_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AlertFrequency = {
  user_id: string;
  kind: AlertKind;
  frequency: NotifyFrequency;
  last_sent_at: string | null;
};

export type PushSubscriptionRecord = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

export type Report = {
  id: string;
  user_id: string;
  type: ReportType;
  content: Json;
  created_at: string;
};

export type ChatLog = {
  id: string;
  user_id: string;
  role: ChatRole;
  message: string;
  context: Json | null;
  timestamp: string;
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AllocationStatus = "inside" | "below" | "above" | "unset";

export type HoldingSnapshot = {
  id: string;
  type: AssetType;
  symbol: string;
  quantity: number;
  price: number | null;
  usedCostBasis: boolean;
  value: number;
  weight: number | null;
};

export type TypeSnapshot = {
  type: AssetType;
  value: number;
  weight: number;
  minPercent: number | null;
  maxPercent: number | null;
  status: AllocationStatus;
};

export type PortfolioSnapshot = {
  totalValue: number;
  holdings: HoldingSnapshot[];
  byType: TypeSnapshot[];
};
