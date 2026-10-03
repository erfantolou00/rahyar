import { changeVersusPriorMonth } from "@/lib/finance/macro/change";
import { macroIndicators, type MacroIndicator } from "@/lib/finance/macro/fred";
import { formatDay, formatNumber, formatPercent, toNumber } from "@/lib/finance/format";
import type { Numeric } from "@/lib/finance/types";

export type MacroReading = {
  indicator: string;
  value: Numeric;
  date: string;
};

export type PresentedMacro = {
  indicator: MacroIndicator;
  label: string;
  value: string;
  change: string;
  tone: "up" | "down" | "flat" | "empty";
  date: string;
};

const labels: Record<MacroIndicator, string> = {
  cpi: "شاخص CPI",
  fed_funds: "نرخ بهره فدرال",
  dxy: "شاخص دلار",
};

function signed(value: number, text: string): string {
  return value > 0 ? `+${text}` : text;
}

function changeLabel(indicator: MacroIndicator, delta: number | null, percent: number | null): { text: string; tone: PresentedMacro["tone"] } {
  const shown = indicator === "fed_funds" ? delta : percent;
  if (shown == null) return { text: "ماه قبل در داده نیست", tone: "empty" };
  const body = indicator === "fed_funds" ? `${formatNumber(shown, 2)} واحد` : formatPercent(shown);
  const tone = shown > 0 ? "up" : shown < 0 ? "down" : "flat";
  return { text: `${signed(shown, body)} نسبت به ماه قبل`, tone };
}

export function presentMacro(rows: MacroReading[]): { cards: PresentedMacro[]; empty: boolean } {
  const known = rows.filter((row): row is MacroReading & { indicator: MacroIndicator } =>
    macroIndicators.includes(row.indicator as MacroIndicator),
  );
  const cards = macroIndicators.map((indicator) => {
    const points = known
      .filter((row) => row.indicator === indicator)
      .map((row) => ({ date: row.date.slice(0, 10), value: toNumber(row.value) }));
    const change = changeVersusPriorMonth(points);
    const movement = changeLabel(indicator, change.delta, change.percent);
    const digits = indicator === "cpi" ? 3 : 2;
    return {
      indicator,
      label: labels[indicator],
      value: change.latest ? (indicator === "fed_funds" ? formatPercent(change.latest.value) : formatNumber(change.latest.value, digits)) : "—",
      change: change.latest ? movement.text : "—",
      tone: change.latest ? movement.tone : "empty",
      date: change.latest ? formatDay(change.latest.date) : "هنوز خوانده نشده",
    };
  });
  return { cards, empty: known.length === 0 };
}
