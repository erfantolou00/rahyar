import type { TransactionType } from "@/lib/finance/types";

export type OverviewSliceInput = {
  id: string;
  label: string;
  value: number;
  weight: number;
  status?: string;
  statusTone?: "ok" | "warn";
};

export type OverviewAlertInput = {
  id: string;
  title: string;
  meta: string;
};

export type OverviewTradeInput = {
  id: string;
  title: string;
  side: TransactionType;
  sideLabel: string;
  qty: string;
  when: string;
  note: string | null;
};

export type OverviewPoint = {
  at: string;
  value: number;
};

export type OverviewSource = {
  sample: boolean;
  sampleReason: "empty" | "preview" | null;
  totalValue: number;
  holdingsCount: number;
  todayAbsolute: number | null;
  todayPercent: number | null;
  totalAbsolute: number | null;
  totalPercent: number | null;
  slices: OverviewSliceInput[];
  alerts: OverviewAlertInput[];
  alertsNote: string | null;
  trades: OverviewTradeInput[];
  tradesNote: string | null;
  series: OverviewPoint[];
  seriesCaption: string;
};
