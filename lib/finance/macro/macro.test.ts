import { describe, expect, it } from "vitest";
import { changeVersusPriorMonth, shiftIsoMonth } from "@/lib/finance/macro/change";
import { FredShapeError, parseFredObservations } from "@/lib/finance/macro/fred";
import { presentMacro } from "@/lib/finance/macro/present";

describe("FRED observations", () => {
  it("keeps numeric points, skips missing values, and sorts by date", () => {
    expect(
      parseFredObservations({
        observations: [
          { date: "2026-08-01", value: "326.054" },
          { date: "2026-09-01", value: "." },
          { date: "2026-07-01", value: "324.100" },
        ],
      }),
    ).toEqual([
      { date: "2026-07-01", value: 324.1 },
      { date: "2026-08-01", value: 326.054 },
    ]);
  });

  it("rejects a payload that no longer has observations", () => {
    expect(() => parseFredObservations({ series: [] })).toThrow(FredShapeError);
    expect(() => parseFredObservations({ observations: [{ date: "2026-08-01", value: "." }] })).toThrow(FredShapeError);
  });
});

describe("change versus the prior month", () => {
  it("uses the observation on or before one calendar month earlier", () => {
    expect(shiftIsoMonth("2026-03-31", 1)).toBe("2026-02-28");
    const monthly = changeVersusPriorMonth([
      { date: "2026-07-01", value: 4.33 },
      { date: "2026-08-01", value: 4.08 },
    ]);
    expect(monthly.prior?.date).toBe("2026-07-01");
    expect(monthly.delta).toBe(-0.25);
    expect(monthly.percent).toBeCloseTo(-5.77, 2);

    const daily = changeVersusPriorMonth([
      { date: "2026-09-01", value: 100 },
      { date: "2026-09-02", value: 101 },
      { date: "2026-10-01", value: 119 },
      { date: "2026-10-02", value: 120 },
    ]);
    expect(daily.prior?.date).toBe("2026-09-02");
    expect(daily.percent).toBeCloseTo(18.81, 2);
  });

  it("leaves the change empty when a month-earlier point is missing", () => {
    expect(changeVersusPriorMonth([{ date: "2026-10-02", value: 120 }]).percent).toBeNull();
    expect(changeVersusPriorMonth([])).toEqual({ latest: null, prior: null, delta: null, percent: null });
  });
});

describe("presentMacro", () => {
  it("shows the funds rate in percentage points and the indexes as a percent change", () => {
    const view = presentMacro([
      { indicator: "fed_funds", value: 4.08, date: "2026-08-01" },
      { indicator: "fed_funds", value: 4.33, date: "2026-07-01" },
      { indicator: "dxy", value: 120, date: "2026-10-02" },
      { indicator: "dxy", value: 100, date: "2026-09-02" },
    ]);
    expect(view.empty).toBe(false);
    const funds = view.cards.find((card) => card.indicator === "fed_funds");
    const dollar = view.cards.find((card) => card.indicator === "dxy");
    expect(funds?.change).toContain("واحد");
    expect(funds?.tone).toBe("down");
    expect(dollar?.change).toContain("٪");
    expect(dollar?.tone).toBe("up");
    expect(view.cards.find((card) => card.indicator === "cpi")?.value).toBe("—");
  });
});
