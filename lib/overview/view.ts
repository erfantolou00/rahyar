import { formatDay, formatNumber, formatPercent } from "@/lib/finance/format";
import { chartColor } from "@/lib/theme";
import { toneOf, type Tone } from "@/lib/overview/tone";
import type { OverviewSource } from "@/lib/overview/types";

export type OverviewKpi = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  hint: string;
  emphasis?: boolean;
  valueTone: Tone;
  delta?: { text: string; tone: Tone };
};

export type OverviewSliceView = {
  id: string;
  label: string;
  weight: number;
  valueLabel: string;
  weightLabel: string;
  color: string;
  status?: string;
  statusTone?: "ok" | "warn";
};

export type OverviewPointView = {
  at: string;
  value: number;
  label: string;
};

export type OverviewView = {
  sample: boolean;
  sampleReason: OverviewSource["sampleReason"];
  kpis: OverviewKpi[];
  slices: OverviewSliceView[];
  alerts: OverviewSource["alerts"];
  alertsNote: string | null;
  trades: OverviewSource["trades"];
  tradesNote: string | null;
  series: OverviewPointView[];
  seriesCaption: string;
  seriesDelta: { text: string; tone: Tone } | null;
};

function signedNumber(value: number, digits = 0): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value), digits)}`;
}

function scaleOf(absolute: number): { amount: number; unit: string; digits: number } {
  const abs = Math.abs(absolute);
  if (abs >= 1_000_000_000) return { amount: abs / 1_000_000_000, unit: "میلیارد ریال", digits: 2 };
  if (abs >= 1_000_000) return { amount: abs / 1_000_000, unit: "میلیون ریال", digits: 2 };
  return { amount: abs, unit: "ریال", digits: 0 };
}

function compactPlain(value: number): { value: string; unit: string } {
  const scaled = scaleOf(value);
  return { value: formatNumber(scaled.amount, scaled.digits), unit: scaled.unit };
}

function compactSigned(value: number): { value: string; unit: string } {
  const scaled = scaleOf(value);
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return { value: `${sign}${formatNumber(scaled.amount, scaled.digits)}`, unit: scaled.unit };
}

function moneyKpi(input: {
  id: string;
  label: string;
  absolute: number | null;
  percent: number | null;
  hint: string;
}): OverviewKpi {
  const compact = input.absolute == null ? null : compactSigned(input.absolute);
  return {
    id: input.id,
    label: input.label,
    value: compact?.value ?? "—",
    unit: compact?.unit,
    hint: input.absolute == null ? input.hint : `${input.hint} · ${formatNumber(input.absolute, 0)} ریال`,
    valueTone: toneOf(input.absolute),
    delta:
      input.percent == null
        ? undefined
        : { text: signedNumber(input.percent, 2) + "٪", tone: toneOf(input.percent) },
  };
}

export function seriesMove(points: { value: number }[]): { absolute: number; percent: number } | null {
  const start = points[0]?.value;
  const end = points[points.length - 1]?.value;
  if (points.length < 2 || start == null || end == null) return null;
  if (!(start > 0)) return null;
  return { absolute: end - start, percent: ((end - start) / start) * 100 };
}

export function decorateSlices(slices: OverviewSource["slices"]): OverviewSliceView[] {
  return [...slices]
    .filter((slice) => slice.value > 0 && slice.weight > 0)
    .sort((left, right) => right.value - left.value)
    .map((slice, index) => {
      const compact = compactPlain(slice.value);
      return {
        id: slice.id,
        label: slice.label,
        weight: slice.weight,
        valueLabel: `${compact.value} ${compact.unit}`,
        weightLabel: formatPercent(slice.weight),
        color: chartColor(index),
        status: slice.status,
        statusTone: slice.statusTone,
      };
    });
}

export function buildOverviewView(source: OverviewSource): OverviewView {
  const slices = decorateSlices(source.slices);

  const move = seriesMove(source.series);
  const total = compactPlain(source.totalValue);
  const holdings =
    source.holdingsCount > 0 ? `${formatNumber(source.holdingsCount, 0)} دارایی` : "بدون دارایی ثبت‌شده";
  const exactTotal = `${formatNumber(source.totalValue, 0)} ریال`;

  return {
    sample: source.sample,
    sampleReason: source.sampleReason,
    kpis: [
      {
        id: "total",
        label: "ارزش کل سبد",
        value: total.value,
        unit: total.unit,
        hint: source.sample ? `عدد نمونه · ${exactTotal}` : `${holdings} · ${exactTotal}`,
        emphasis: true,
        valueTone: "neutral",
      },
      moneyKpi({
        id: "today",
        label: "سود و زیان امروز",
        absolute: source.todayAbsolute,
        percent: source.todayPercent,
        hint: source.sample
          ? "عدد نمونه"
          : source.todayAbsolute == null
            ? "از شب دوم، نسبت به ارزش پایانی دیشب حساب می‌شود."
            : "نسبت به ارزش پایانی دیشب",
      }),
      moneyKpi({
        id: "total-return",
        label: "سود و زیان کل",
        absolute: source.totalAbsolute,
        percent: source.totalPercent,
        hint: source.sample
          ? "عدد نمونه، نسبت به بهای تمام‌شده"
          : source.totalAbsolute == null
            ? "میانگین خرید برای محاسبه بازده کافی نیست."
            : "نسبت به بهای تمام‌شده",
      }),
    ],
    slices,
    alerts: source.alerts,
    alertsNote: source.alertsNote,
    trades: source.trades,
    tradesNote: source.tradesNote,
    series: source.series.map((point) => ({
      ...point,
      label: formatDay(point.at),
    })),
    seriesCaption: source.seriesCaption,
    seriesDelta:
      move == null
        ? null
        : { text: `${signedNumber(move.percent, 2)}٪`, tone: toneOf(move.percent) },
  };
}
