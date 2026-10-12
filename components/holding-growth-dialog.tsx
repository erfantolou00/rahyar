"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDay, formatDollar, formatMoney, formatNumber, formatPercent } from "@/lib/finance/format";
import {
  dayKey,
  growthRanges,
  shiftDays,
  sliceGrowth,
  todayKey,
  type GrowthPoint,
  type GrowthRangeId,
} from "@/lib/finance/holding-growth";
import { transactionTypeLabels } from "@/lib/finance/labels";
import type { PresentedRow } from "@/lib/finance/basket-view";
import type { TransactionType } from "@/lib/finance/types";

type GrowthTrade = {
  id: string;
  at: string;
  type: TransactionType;
  qty: number;
  price: number;
  note: string | null;
};

type GrowthPayload = {
  symbol: string;
  unit: "rial" | "usd";
  basis: "trades" | "quantity";
  points: GrowthPoint[];
  trades: GrowthTrade[];
};

export function HoldingGrowthDialog({
  row,
  onClose,
}: {
  row: PresentedRow | null;
  onClose: () => void;
}) {
  const rowId = row?.id ?? null;
  const [trackedId, setTrackedId] = useState<string | null>(rowId);
  const [range, setRange] = useState<GrowthRangeId>("month");
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<
    { id: string; status: "ready"; payload: GrowthPayload } | { id: string; status: "error" } | null
  >(null);

  if (rowId !== trackedId) {
    setTrackedId(rowId);
    setRange("month");
    setLoad(null);
  }

  useEffect(() => {
    if (!rowId) return;
    let ignore = false;
    void fetch(`/api/holdings/${rowId}/growth`)
      .then(async (response) => {
        if (!response.ok) throw new Error("growth");
        return (await response.json()) as GrowthPayload;
      })
      .then((body) => {
        if (!ignore) setLoad({ id: rowId, status: "ready", payload: body });
      })
      .catch(() => {
        if (!ignore) setLoad({ id: rowId, status: "error" });
      });
    return () => {
      ignore = true;
    };
  }, [rowId, attempt]);

  const today = todayKey();
  const selected = growthRanges.find((item) => item.id === range) ?? growthRanges[0];
  const current = load?.id === rowId && load.status === "ready" ? load.payload : null;
  const failed = load?.id === rowId && load.status === "error";
  const summary = current ? sliceGrowth(current.points, selected?.days ?? null, today) : null;
  const windowStart = selected?.days == null ? null : shiftDays(today, selected.days);
  const trades = current
    ? current.trades
        .filter((trade) => {
          const day = dayKey(trade.at);
          if (windowStart == null) return day <= today;
          return day >= windowStart && day <= today;
        })
        .sort((left, right) => right.at.localeCompare(left.at))
    : [];

  return (
    <Dialog open={row != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>رشد {current?.symbol ?? row?.cells.name}</DialogTitle>
          <DialogDescription>ارزش پول شما در این دارایی، در بازه‌های زمانی مختلف، همراه با خرید و فروش.</DialogDescription>
        </DialogHeader>

        {row && !current && !failed ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            در حال محاسبه رشد...
          </p>
        ) : null}

        {failed ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">رشد این دارایی خوانده نشد.</p>
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoad(null);
                  setAttempt((current) => current + 1);
                }}
              >
                تلاش دوباره
              </Button>
            </div>
          </div>
        ) : null}

        {current && summary ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {growthRanges.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === range}
                  onClick={() => setRange(item.id)}
                  className={
                    item.id === range
                      ? "rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                      : "rounded-lg border border-line px-3 py-1.5 text-sm"
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>

            <GrowthChart points={summary.points} />

            <dl className="grid gap-3 sm:grid-cols-4">
              <Figure label="ارزش ابتدا" value={money(summary.startValue, current.unit)} />
              <Figure label="ارزش پایان" value={money(summary.endValue, current.unit)} />
              <Figure label="تغییر" value={signedMoney(summary.change, current.unit)} tone={toneOf(summary.change)} />
              <Figure label="بازده" value={signedPercent(summary.changePercent)} tone={toneOf(summary.changePercent)} />
            </dl>

            <p className="text-xs leading-6 text-muted-foreground">
              {current.basis === "trades"
                ? "مقدار هر روز از خرید و فروش تا همان روز حساب شده و در قیمت همان روز ضرب شده است."
                : "تراکنشی برای این دارایی ثبت نشده. نمودار با مقدار فعلی و قیمت‌های ذخیره‌شده رسم شده است."}
            </p>

            <div className="grid gap-2">
              <h3 className="text-sm font-medium">خرید و فروش</h3>
              {trades.length === 0 ? (
                <p className="text-sm text-muted-foreground">در این بازه خریدی ثبت نشده است.</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    خرید <span className="numeric">{money(cash(trades, ["buy", "deposit"]), current.unit)}</span>
                    {" · "}
                    فروش <span className="numeric">{money(cash(trades, ["sell", "withdraw"]), current.unit)}</span>
                  </p>
                  <ul className="grid max-h-56 gap-2 overflow-y-auto">
                    {trades.map((trade) => (
                      <li key={trade.id} className="flex items-start justify-between gap-3 text-sm">
                        <span>
                          {transactionTypeLabels[trade.type]}
                          <span className="numeric text-muted-foreground"> · {formatDay(trade.at)}</span>
                          {trade.note ? <span className="mt-1 block text-xs text-muted-foreground">{trade.note}</span> : null}
                        </span>
                        <span className="numeric text-left">
                          {formatNumber(trade.qty)} × {money(trade.price, current.unit)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function cash(trades: GrowthTrade[], types: TransactionType[]): number {
  return trades.filter((trade) => types.includes(trade.type)).reduce((sum, trade) => sum + trade.qty * trade.price, 0);
}

function money(value: number | null, unit: "rial" | "usd"): string {
  if (value == null) return "—";
  return unit === "usd" ? formatDollar(value, 2) : formatMoney(value);
}

function signedMoney(value: number | null, unit: "rial" | "usd"): string {
  if (value == null) return "—";
  const text = money(value, unit);
  return value > 0 ? `+${text}` : text;
}

function signedPercent(value: number | null): string {
  if (value == null) return "—";
  const text = formatPercent(value);
  return value > 0 ? `+${text}` : text;
}

function toneOf(value: number | null): string {
  if (value == null || value === 0) return "";
  return value > 0 ? "text-ok" : "text-danger";
}

function Figure({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`numeric mt-1 text-base font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}

function GrowthChart({ points }: { points: GrowthPoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">برای این بازه قیمتی ثبت نشده است.</p>;
  }

  const width = 640;
  const height = 180;
  const pad = 12;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (point.value - min) / span) * (height - pad * 2);
    return { x, y };
  });
  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const up = (points[points.length - 1]?.value ?? 0) >= (points[0]?.value ?? 0);
  const color = up ? "text-ok" : "text-danger";

  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="نمودار رشد ارزش" className={`h-44 w-full ${color}`}>
        <polygon points={area} fill="currentColor" opacity="0.12" />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {coords.length < 24
          ? coords.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3.5" fill="currentColor" />)
          : null}
      </svg>
      <figcaption className="flex justify-between text-xs text-muted-foreground">
        <span className="numeric">{formatDay(points[0]?.at ?? "")}</span>
        <span className="numeric">{formatDay(points[points.length - 1]?.at ?? "")}</span>
      </figcaption>
    </figure>
  );
}
