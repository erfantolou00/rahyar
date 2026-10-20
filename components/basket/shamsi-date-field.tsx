"use client";

import { useId, useState } from "react";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/finance/format";
import {
  formatJalali,
  formatJalaliYear,
  gregorianIso,
  isoToJalali,
  jalaliMonthLength,
  jalaliMonthName,
  jalaliToGregorian,
  weekdayIndex,
} from "@/lib/finance/jalali";

const weekdays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

export function ShamsiDateField({
  name,
  defaultValue,
  label = "تاریخ خرید",
}: {
  name: string;
  defaultValue: string;
  label?: string;
}) {
  const labelId = useId();
  const initial = isoToJalali(defaultValue) ?? { jy: 1405, jm: 1, jd: 1 };
  const [iso, setIso] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState({ jy: initial.jy, jm: initial.jm });
  const selected = isoToJalali(iso);
  const days = jalaliMonthLength(cursor.jy, cursor.jm);
  const first = jalaliToGregorian(cursor.jy, cursor.jm, 1);
  const lead = weekdayIndex(first.gy, first.gm, first.gd);
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, index) => index + 1)];

  function shiftMonth(delta: number) {
    const next = cursor.jm + delta;
    if (next < 1) setCursor({ jy: cursor.jy - 1, jm: 12 });
    else if (next > 12) setCursor({ jy: cursor.jy + 1, jm: 1 });
    else setCursor({ jy: cursor.jy, jm: next });
  }

  function choose(day: number) {
    const gregorian = jalaliToGregorian(cursor.jy, cursor.jm, day);
    setIso(gregorianIso(gregorian.gy, gregorian.gm, gregorian.gd));
    setOpen(false);
  }

  return (
    <div className="grid gap-1.5">
      <Label id={labelId}>{label}</Label>
      <input type="hidden" name={name} value={iso} />
      <button
        type="button"
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="numeric h-10 rounded-lg border border-input bg-card px-2.5 text-start text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {formatJalali(iso)}
      </button>
      {open ? (
        <div role="dialog" aria-label="تقویم شمسی" className="grid gap-2 rounded-lg border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="h-9 rounded-full px-3 text-xs outline-none hover:bg-accent-soft focus-visible:ring-3 focus-visible:ring-ring/50" onClick={() => shiftMonth(-1)}>
              ماه قبل
            </button>
            <p className="text-sm font-medium">
              {jalaliMonthName(cursor.jm)} <span className="numeric">{formatJalaliYear(cursor.jy)}</span>
            </p>
            <button type="button" className="h-9 rounded-full px-3 text-xs outline-none hover:bg-accent-soft focus-visible:ring-3 focus-visible:ring-ring/50" onClick={() => shiftMonth(1)}>
              ماه بعد
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, index) =>
              day == null ? (
                <span key={`empty-${index}`} />
              ) : (
                <button
                  key={day}
                  type="button"
                  aria-pressed={selected?.jy === cursor.jy && selected.jm === cursor.jm && selected.jd === day}
                  onClick={() => choose(day)}
                  className={`numeric h-9 rounded-lg text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                    selected?.jy === cursor.jy && selected.jm === cursor.jm && selected.jd === day
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent-soft"
                  }`}
                >
                  {formatNumber(day, 0)}
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
