import { formatDay, formatNumber, formatQuantity, toNumber } from "@/lib/finance/format";
import {
  alertChannelLabels,
  alertKindLabels,
  allocationStatusLabels,
  assetTypeLabels,
  notifyFrequencyLabels,
  transactionTypeLabels,
} from "@/lib/finance/labels";
import type { Numeric, Transaction, TypeSnapshot } from "@/lib/finance/types";
import type { OverviewSource } from "@/lib/overview/types";

type LiveAlert = {
  id: string;
  kind: string;
  is_active: boolean;
  rule: string;
  threshold: Numeric;
  channel: string;
  frequency: string;
};

function named<T extends string>(map: Record<T, string>, value: string): string {
  return Object.prototype.hasOwnProperty.call(map, value) ? map[value as T] : value;
}

export function describeAlert(alert: Pick<LiveAlert, "kind" | "rule" | "threshold" | "channel" | "frequency">): {
  title: string;
  meta: string;
} {
  return {
    title: alert.rule,
    meta: [
      named(alertKindLabels, alert.kind),
      `آستانه ${formatNumber(toNumber(alert.threshold))}`,
      named(alertChannelLabels, alert.channel),
      named(notifyFrequencyLabels, alert.frequency),
    ].join(" · "),
  };
}

export function liveOverviewSource(input: {
  totalValue: number;
  holdingsCount: number;
  totalAbsolute: number | null;
  totalPercent: number | null;
  todayAbsolute: number | null;
  todayPercent: number | null;
  series: { at: string; value: number }[];
  seriesCaption: string;
  byType: TypeSnapshot[];
  alerts: LiveAlert[] | null;
  transactions: Transaction[] | null;
  symbols: ReadonlyMap<string, string>;
}): OverviewSource {
  const alerts = (input.alerts ?? [])
    .filter((alert) => alert.is_active && alert.kind !== "allocation_deviation")
    .slice(0, 4)
    .map((alert) => ({
      id: alert.id,
      ...describeAlert(alert),
    }));

  const trades = (input.transactions ?? []).slice(0, 5).map((row) => ({
    id: row.id,
    title: input.symbols.get(row.asset_id) || transactionTypeLabels[row.type],
    side: row.type,
    sideLabel: transactionTypeLabels[row.type],
    qty: formatQuantity(toNumber(row.qty)),
    when: formatDay(row.date),
    note: row.note,
  }));

  return {
    sample: false,
    sampleReason: null,
    totalValue: input.totalValue,
    holdingsCount: input.holdingsCount,
    todayAbsolute: input.todayAbsolute,
    todayPercent: input.todayPercent,
    totalAbsolute: input.totalAbsolute,
    totalPercent: input.totalPercent,
    slices: input.byType.map((row) => ({
      id: row.type,
      label: assetTypeLabels[row.type],
      value: row.value,
      weight: row.weight,
      status: row.status === "unset" ? undefined : allocationStatusLabels[row.status],
      statusTone: row.status === "inside" ? "ok" : row.status === "unset" ? undefined : "warn",
    })),
    alerts,
    alertsNote:
      input.alerts == null
        ? "هشدارها خوانده نشد."
        : alerts.length === 0
          ? "هشدار فعالی تنظیم نشده است."
          : null,
    trades,
    tradesNote:
      input.transactions == null
        ? "تراکنش‌ها خوانده نشد."
        : trades.length === 0
          ? "تراکنشی ثبت نشده است."
          : null,
    series: input.series,
    seriesCaption: input.seriesCaption,
  };
}
