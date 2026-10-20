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
import { formatDay, formatDollar, formatMoney, formatPercent } from "@/lib/finance/format";
import {
  growthRanges,
  sliceGrowth,
  todayKey,
  type GrowthPoint,
  type GrowthRangeId,
} from "@/lib/finance/holding-growth";
import type { PresentedRow } from "@/lib/finance/basket-view";

type GrowthPayload = {
  symbol: string;
  unit: "rial" | "usd";
  points: GrowthPoint[];
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

  return (
    <Dialog open={row != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>رشد {current?.symbol ?? row?.cells.name}</DialogTitle>
          <DialogDescription>ارزش تعداد فعلی این دارایی، با قیمت ذخیره‌شده در هر روز.</DialogDescription>
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
              نمودار تعداد فعلی سبد را در قیمت هر روز ضرب می‌کند. دلار، طلا، سکه و بیت‌کوین از نماد بازار خوانده می‌شوند.
            </p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
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
