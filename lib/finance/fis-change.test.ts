import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/finance/format";
import {
  fisChangeAlert,
  fisChangeMessage,
  interpretFisChange,
  type FisChangeFactor,
  type FisChangeNotice,
  type FisChangeSnapshot,
} from "@/lib/finance/fis-change";
import type { FisStatus } from "@/lib/finance/fis";

function factor(key: string, label: string, score: number): FisChangeFactor {
  return { key, label, score };
}

function snap(status: FisStatus, score: number | null, factors: FisChangeFactor[] = []): FisChangeSnapshot {
  return { status, score, factors };
}

const pair = [
  factor("forward_pe", "نسبت قیمت به سود", 15),
  factor("margin", "حاشیه سود", 10),
  factor("sales_growth", "رشد فروش", 7),
];

describe("fisChangeAlert", () => {
  it("alerts on a drop of exactly 10 without a floor crossing", () => {
    const decision = fisChangeAlert(snap("hold", 80, pair), snap("hold", 70, pair));
    expect(decision.alert).toBe(true);
    expect(decision.reasons).toEqual([
      `امتیاز ${formatNumber(10, 2)} واحد کم شد و از ${formatNumber(80, 2)} به ${formatNumber(70, 2)} رسید.`,
    ]);
  });

  it("stays quiet on a drop of 9", () => {
    const decision = fisChangeAlert(snap("hold", 80), snap("hold", 71));
    expect(decision).toEqual({ alert: false, reasons: [], factors: [] });
  });

  it("stays quiet when the score rises and both floors stay on the same side", () => {
    const decision = fisChangeAlert(snap("hold", 70), snap("hold", 90));
    expect(decision.alert).toBe(false);
  });

  it("stays quiet one point above the hold floor", () => {
    const decision = fisChangeAlert(snap("hold", 46), snap("hold", 45));
    expect(decision.alert).toBe(false);
  });

  it("alerts when the score crosses 60 downward or upward", () => {
    const down = fisChangeAlert(snap("hold", 60), snap("hold", 59));
    const up = fisChangeAlert(snap("watch", 59), snap("watch", 60));
    expect(down.alert).toBe(true);
    expect(down.reasons[0]).toContain(formatNumber(60, 2));
    expect(up.alert).toBe(true);
    expect(up.reasons[0]).toContain(formatNumber(60, 2));
  });

  it("alerts when the score crosses 45 downward or upward", () => {
    const down = fisChangeAlert(snap("hold", 45), snap("hold", 44));
    const up = fisChangeAlert(snap("exit", 44), snap("exit", 45));
    expect(down.alert).toBe(true);
    expect(down.reasons.some((reason) => reason.includes(formatNumber(45, 2)))).toBe(true);
    expect(up.alert).toBe(true);
    expect(up.reasons.some((reason) => reason.includes(formatNumber(45, 2)))).toBe(true);
  });

  it("names a drop of 10 that also crosses 60, and a drop that crosses only 45", () => {
    const enter = fisChangeAlert(snap("hold", 60), snap("hold", 50));
    const hold = fisChangeAlert(snap("hold", 50), snap("hold", 40));
    expect(enter.reasons).toHaveLength(2);
    expect(hold.reasons).toHaveLength(2);
    expect(hold.reasons.some((reason) => reason.includes(formatNumber(45, 2)))).toBe(true);
    expect(hold.reasons.some((reason) => reason.includes(formatNumber(60, 2)))).toBe(false);
  });

  it("names the status change, the drop, and both floors together", () => {
    const decision = fisChangeAlert(snap("hold", 61), snap("exit", 44));
    expect(decision.reasons).toHaveLength(4);
    expect(decision.reasons[0]).toBe("وضعیت از نگهداری به خروج عوض شد.");
  });

  it("alerts on a status change when the scores are missing", () => {
    const decision = fisChangeAlert(snap("hold", null), snap("exit", null));
    expect(decision.alert).toBe(true);
    expect(decision.reasons).toEqual(["وضعیت از نگهداری به خروج عوض شد."]);
  });

  it("stays quiet when both scores are missing and the status is unchanged", () => {
    expect(fisChangeAlert(snap("hold", null), snap("hold", null)).alert).toBe(false);
  });

  it("stays quiet when there is no previous assessment", () => {
    expect(fisChangeAlert(null, snap("exit", 20)).alert).toBe(false);
  });

  it("returns the two factors with the largest absolute change and skips a factor seen on only one side", () => {
    const previous = snap("hold", 80, [
      ...pair,
      factor("fiscal_year", "سال مالی", 5),
    ]);
    const next = snap("hold", 70, [
      factor("forward_pe", "نسبت قیمت به سود", 5),
      factor("margin", "حاشیه سود", 9),
      factor("sales_growth", "رشد فروش", 15),
      factor("dividend", "سود تقسیمی", 0),
    ]);
    const decision = fisChangeAlert(previous, next);
    expect(decision.factors.map((item) => [item.key, item.delta])).toEqual([
      ["forward_pe", -10],
      ["sales_growth", 8],
    ]);
  });

  it("breaks an equal move by factor key and keeps a single shared factor", () => {
    const tied = fisChangeAlert(
      snap("hold", 80, [factor("sales_growth", "رشد فروش", 4), factor("forward_pe", "نسبت", 4), factor("margin", "حاشیه", 4)]),
      snap("exit", 80, [factor("sales_growth", "رشد فروش", 8), factor("forward_pe", "نسبت", 8), factor("margin", "حاشیه", 3)]),
    );
    expect(tied.factors.map((item) => item.key)).toEqual(["forward_pe", "sales_growth"]);
    const single = fisChangeAlert(
      snap("hold", 80, [factor("margin", "حاشیه", 10)]),
      snap("exit", 80, [factor("margin", "حاشیه", 4), factor("dividend", "سود", 1)]),
    );
    expect(single.factors).toEqual([{ key: "margin", label: "حاشیه", from: 10, to: 4, delta: -6 }]);
  });

  it("builds a fixed message from the symbol, the reason, and the two factors", () => {
    const previous = snap("hold", 80, pair);
    const next = snap("hold", 70, [
      factor("forward_pe", "نسبت قیمت به سود", 5),
      factor("margin", "حاشیه سود", 9),
      factor("sales_growth", "رشد فروش", 15),
    ]);
    const decision = fisChangeAlert(previous, next);
    const notice: FisChangeNotice = { symbol: "فملی", previous, next, decision };
    const message = fisChangeMessage(notice);
    expect(message.startsWith("صورت مالی جدید فملی ارزیابی شد.")).toBe(true);
    expect(message).toContain("نسبت قیمت به سود");
    expect(message).toContain("رشد فروش");
    expect(message).not.toContain("حاشیه سود");
    expect(message).not.toContain("بخر");
    expect(message.length).toBeLessThanOrEqual(500);
  });
});

describe("interpretFisChange", () => {
  const previous = snap("hold", 80, [factor("margin", "حاشیه", 10)]);
  const next = snap("hold", 70, [factor("margin", "حاشیه", 4)]);
  const notice: FisChangeNotice = {
    symbol: "فملی",
    previous,
    next,
    decision: fisChangeAlert(previous, next),
  };

  it("keeps three lines that only use stored numbers", async () => {
    const text = await interpretFisChange(notice, async () => ({
      ok: true,
      text: "امتیاز ۸۰ بود.\nامتیاز ۷۰ شد.\nحاشیه از ۱۰ به ۴ رسید.",
      model: "test",
    }));
    expect(text).toBe("امتیاز ۸۰ بود.\nامتیاز ۷۰ شد.\nحاشیه از ۱۰ به ۴ رسید.");
  });

  it("rejects an unknown number, the wrong line count, an order, a failure, and a throw", async () => {
    const unknown = await interpretFisChange(notice, async () => ({
      ok: true,
      text: "امتیاز ۹۹۹ است.\nخط دوم.\nخط سوم.",
      model: "test",
    }));
    const short = await interpretFisChange(notice, async () => ({ ok: true, text: "یک خط.\nدو خط.", model: "test" }));
    const order = await interpretFisChange(notice, async () => ({
      ok: true,
      text: "این سهم را بخر.\nخط دوم.\nخط سوم.",
      model: "test",
    }));
    const failed = await interpretFisChange(notice, async () => ({ ok: false, reason: "timeout", detail: "timeout" }));
    const thrown = await interpretFisChange(notice, async () => {
      throw new Error("down");
    });
    expect(unknown).toBeNull();
    expect(short).toBeNull();
    expect(order).toBeNull();
    expect(failed).toBeNull();
    expect(thrown).toBeNull();
  });
});
