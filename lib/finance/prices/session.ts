const SESSION_DAYS = new Set(["Sat", "Sun", "Mon", "Tue", "Wed"]);
const STALE_WHILE_OPEN_MS = 60 * 60 * 1000;

export type TehranClock = {
  weekday: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export function tehranClock(now: Date): TehranClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const bag = new Map(parts.map((part) => [part.type, part.value]));
  const hour = Number(bag.get("hour"));
  return {
    weekday: bag.get("weekday") ?? "",
    year: Number(bag.get("year")),
    month: Number(bag.get("month")),
    day: Number(bag.get("day")),
    hour: hour === 24 ? 0 : hour,
    minute: Number(bag.get("minute")),
  };
}

/** Saturday–Wednesday, 09:00 inclusive through 13:00 exclusive, Asia/Tehran. */
export function isListedSession(now: Date): boolean {
  const clock = tehranClock(now);
  if (!SESSION_DAYS.has(clock.weekday)) return false;
  return clock.hour >= 9 && clock.hour < 13;
}

function shiftCalendarDay(year: number, month: number, day: number, delta: number): {
  year: number;
  month: number;
  day: number;
} {
  const date = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function weekdayOfCalendar(year: number, month: number, day: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function dayKey(year: number, month: number, day: number): number {
  return year * 10_000 + month * 100 + day;
}

/** Trading day whose prices are the latest ones worth keeping while the market is shut. */
export function latestListedSessionDay(now: Date): number {
  const clock = tehranClock(now);
  let cursor = { year: clock.year, month: clock.month, day: clock.day };
  if (!SESSION_DAYS.has(clock.weekday) || clock.hour < 9) {
    cursor = shiftCalendarDay(cursor.year, cursor.month, cursor.day, -1);
  }
  for (let step = 0; step < 7; step += 1) {
    const weekday = weekdayOfCalendar(cursor.year, cursor.month, cursor.day);
    if (SESSION_DAYS.has(weekday)) return dayKey(cursor.year, cursor.month, cursor.day);
    cursor = shiftCalendarDay(cursor.year, cursor.month, cursor.day, -1);
  }
  return dayKey(clock.year, clock.month, clock.day);
}

function quoteDay(quotedAt: string): number | null {
  const quoted = new Date(quotedAt);
  if (!Number.isFinite(quoted.getTime())) return null;
  const clock = tehranClock(quoted);
  if (!Number.isFinite(clock.year) || !Number.isFinite(clock.month) || !Number.isFinite(clock.day)) return null;
  return dayKey(clock.year, clock.month, clock.day);
}

/**
 * While the exchange is open, a listed quote older than an hour is stale.
 * After the close, a quote from that session stays current until the next open.
 */
export function listedQuoteStale(quotedAt: string, now: Date): boolean {
  if (isListedSession(now)) {
    const quoted = new Date(quotedAt).getTime();
    return !Number.isFinite(quoted) || now.getTime() - quoted >= STALE_WHILE_OPEN_MS;
  }
  const day = quoteDay(quotedAt);
  return day == null || day < latestListedSessionDay(now);
}
