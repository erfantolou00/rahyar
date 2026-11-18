import { describe, expect, it } from "vitest";
import { formatJalali, gregorianToJalali, jalaliMonthLength, jalaliToGregorian, parseIsoDate } from "@/lib/finance/jalali";

describe("jalali", () => {
  it("maps 21 March 2026 to 1 Farvardin 1405", () => {
    expect(gregorianToJalali(2026, 3, 21)).toEqual({ jy: 1405, jm: 1, jd: 1 });
  });

  it("maps 18 October 2026 to 26 Mehr 1405", () => {
    expect(gregorianToJalali(2026, 10, 18)).toEqual({ jy: 1405, jm: 7, jd: 26 });
    expect(formatJalali("2026-10-18")).toBe("۱۴۰۵/۰۷/۲۶");
  });

  it("round-trips a leap-year Esfand day", () => {
    const back = jalaliToGregorian(1403, 12, 30);
    expect(gregorianToJalali(back.gy, back.gm, back.gd)).toEqual({ jy: 1403, jm: 12, jd: 30 });
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
  });

  it("rejects a day that is not on the calendar", () => {
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("1405/07/26")).toBeNull();
  });
});
