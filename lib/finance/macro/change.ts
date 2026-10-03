export type MacroPoint = {
  date: string;
  value: number;
};

export type MonthChange = {
  latest: MacroPoint | null;
  prior: MacroPoint | null;
  delta: number | null;
  percent: number | null;
};

const EMPTY: MonthChange = { latest: null, prior: null, delta: null, percent: null };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function shiftIsoMonth(isoDate: string, months: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);
  const monthText = String(target.getUTCMonth() + 1).padStart(2, "0");
  const dayText = String(clamped).padStart(2, "0");
  return `${target.getUTCFullYear()}-${monthText}-${dayText}`;
}

export function changeVersusPriorMonth(points: MacroPoint[]): MonthChange {
  const sorted = points
    .filter((point) => Number.isFinite(point.value) && point.date)
    .sort((left, right) => left.date.localeCompare(right.date));
  const latest = sorted.at(-1) ?? null;
  if (!latest) return EMPTY;
  const target = shiftIsoMonth(latest.date, 1);
  if (!target) return { ...EMPTY, latest };
  const prior = [...sorted].reverse().find((point) => point.date <= target && point.date < latest.date) ?? null;
  if (!prior) return { latest, prior: null, delta: null, percent: null };
  const delta = round2(latest.value - prior.value);
  const percent = prior.value === 0 ? null : round2((latest.value / prior.value - 1) * 100);
  return { latest, prior, delta, percent };
}
