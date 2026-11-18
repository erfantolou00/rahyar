import { describe, expect, it } from "vitest";
import { interpretFisChange, type FisChangeFactor, type FisChangeSnapshot } from "@/lib/finance/fis-change";
import type { FisStatus } from "@/lib/finance/fis";
import type { FinanceClient } from "@/lib/finance/queries";
import { fisChangeRule, followSyncedStatement, isNewFinancialStatement, type PublishedSymbolFis } from "@/lib/finance/statement-follow";

function factor(key: string, label: string, score: number): FisChangeFactor {
  return { key, label, score };
}

function snap(status: FisStatus, score: number | null, factors: FisChangeFactor[] = []): FisChangeSnapshot {
  return { status, score, factors };
}

const statement = {
  tracingNo: 200,
  letterCode: "ن-10",
  title: "اطلاعات و صورت‌های مالی میاندوره‌ای",
};

function memory() {
  const rows: {
    user_id: string;
    kind: string;
    rule: string;
    message: string;
    asset_type: string;
    threshold: number;
    is_active: boolean;
  }[] = [];
  let dispatches = 0;
  const client = {
    from(table: string) {
      if (table !== "alerts") throw new Error(table);
      return {
        insert(row: (typeof rows)[number]) {
          const duplicate = rows.some(
            (item) => item.user_id === row.user_id && item.rule === row.rule && item.kind === row.kind && item.is_active && row.is_active,
          );
          if (duplicate) return Promise.resolve({ error: { code: "23505", message: "duplicate" } });
          rows.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as FinanceClient;
  return {
    rows,
    client,
    dispatch: async () => {
      dispatches += 1;
    },
    dispatches: () => dispatches,
  };
}

const moved = {
  previous: snap("hold", 80, [factor("forward_pe", "نسبت", 15), factor("margin", "حاشیه", 10)]),
  next: snap("exit", 55, [factor("forward_pe", "نسبت", 5), factor("margin", "حاشیه", 9)]),
};

describe("followSyncedStatement", () => {
  it("treats only a new ن-۱۰ as a statement to score", () => {
    expect(isNewFinancialStatement("100", statement)).toBe(true);
    expect(isNewFinancialStatement("200", statement)).toBe(false);
    expect(isNewFinancialStatement(null, statement)).toBe(false);
    expect(isNewFinancialStatement("100", { tracingNo: 201, letterCode: "ن-30", title: "گزارش فعالیت ماهانه" })).toBe(false);
    expect(isNewFinancialStatement("100", { tracingNo: 202, letterCode: "ن-10", title: "صورت‌های مالی شرکت فرعی" })).toBe(false);
  });

  it("stores one alert across two consecutive syncs", async () => {
    const store = memory();
    let tracing: string | null = "100";
    let publishes = 0;
    for (let step = 0; step < 2; step += 1) {
      const result = await followSyncedStatement({
        supabase: store.client,
        userId: "user-1",
        symbol: "فملی",
        previousTracing: tracing,
        newest: statement,
        periodStored: true,
        publish: async () => {
          publishes += 1;
          return { ok: true, ...moved };
        },
        interpret: async () => null,
        dispatch: store.dispatch,
      });
      expect(result).toEqual(step === 0 ? { scored: true, alerted: true } : { scored: false, alerted: false });
      tracing = String(statement.tracingNo);
    }
    expect(publishes).toBe(1);
    expect(store.dispatches()).toBe(1);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      user_id: "user-1",
      kind: "fis_change",
      asset_type: "stock",
      rule: fisChangeRule("فملی", "200"),
      threshold: 55,
      is_active: true,
    });
    expect(store.rows[0].message.startsWith("صورت مالی جدید فملی ارزیابی شد.")).toBe(true);
    expect(store.rows[0].message.length).toBeLessThanOrEqual(500);
  });

  it("rejects a second insert for the same letter", async () => {
    const store = memory();
    let publishes = 0;
    const run = () => followSyncedStatement({
      supabase: store.client,
      userId: "user-1",
      symbol: "فملی",
      previousTracing: "100",
      newest: statement,
      periodStored: true,
      publish: async () => {
        publishes += 1;
        return { ok: true, ...moved };
      },
      interpret: async () => null,
      dispatch: store.dispatch,
    });
    expect(await run()).toEqual({ scored: true, alerted: true });
    expect(await run()).toEqual({ scored: true, alerted: false });
    expect(publishes).toBe(2);
    expect(store.rows).toHaveLength(1);
    expect(store.dispatches()).toBe(1);
  });

  it("does not score a monthly letter, a repeat tracing, or a period that was not stored", async () => {
    const store = memory();
    let publishes = 0;
    const publish = async (): Promise<PublishedSymbolFis> => {
      publishes += 1;
      return { ok: true, ...moved };
    };
    const base = {
      supabase: store.client,
      userId: "user-1",
      symbol: "فملی",
      previousTracing: "100",
      periodStored: true,
      publish,
      dispatch: store.dispatch,
    };
    expect(await followSyncedStatement({ ...base, newest: { tracingNo: 201, letterCode: "ن-30", title: "گزارش فعالیت ماهانه" } })).toEqual({
      scored: false,
      alerted: false,
    });
    expect(await followSyncedStatement({ ...base, newest: statement, previousTracing: "200" })).toEqual({ scored: false, alerted: false });
    expect(await followSyncedStatement({ ...base, newest: statement, periodStored: false })).toEqual({ scored: false, alerted: false });
    expect(publishes).toBe(0);
    expect(store.rows).toHaveLength(0);
  });

  it("writes the score without an alert when the assessment did not change", async () => {
    const store = memory();
    const same = snap("hold", 80, [factor("margin", "حاشیه", 10)]);
    const result = await followSyncedStatement({
      supabase: store.client,
      userId: "user-1",
      symbol: "فملی",
      previousTracing: "100",
      newest: statement,
      periodStored: true,
      publish: async () => ({ ok: true, previous: same, next: same }),
      dispatch: store.dispatch,
    });
    expect(result).toEqual({ scored: true, alerted: false });
    expect(store.rows).toHaveLength(0);
    expect(store.dispatches()).toBe(0);
  });

  it("keeps the fixed text when the interpretation uses an unknown number", async () => {
    const store = memory();
    await followSyncedStatement({
      supabase: store.client,
      userId: "user-1",
      symbol: "فملی",
      previousTracing: "100",
      newest: statement,
      periodStored: true,
      publish: async () => ({ ok: true, ...moved }),
      interpret: (notice) => interpretFisChange(notice, async () => ({
        ok: true,
        text: "امتیاز ۹۹۹ است.\nخط دوم.\nخط سوم.",
        model: "test",
      })),
      dispatch: store.dispatch,
    });
    expect(store.rows[0].message.startsWith("صورت مالی جدید فملی ارزیابی شد.")).toBe(true);
    expect(store.rows[0].message).not.toContain("۹۹۹");
  });

  it("stores three accepted lines instead of the fixed text", async () => {
    const store = memory();
    await followSyncedStatement({
      supabase: store.client,
      userId: "user-1",
      symbol: "فملی",
      previousTracing: "100",
      newest: statement,
      periodStored: true,
      publish: async () => ({ ok: true, ...moved }),
      interpret: (notice) => interpretFisChange(notice, async () => ({
        ok: true,
        text: "صورت تازه بررسی شد.\nامتیاز پایین‌تر است.\nجزئیات در هشدار است.",
        model: "test",
      })),
      dispatch: store.dispatch,
    });
    expect(store.rows[0].message).toBe("صورت تازه بررسی شد.\nامتیاز پایین‌تر است.\nجزئیات در هشدار است.");
  });
});
