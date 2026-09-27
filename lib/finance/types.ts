export const assetTypes = [
  "stock",
  "gold",
  "coin",
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

export type Alert = {
  id: string;
  user_id: string;
  rule: string;
  threshold: Numeric;
  channel: string;
  is_active: boolean;
  frequency: string;
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
