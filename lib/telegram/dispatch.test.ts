import { describe, expect, it } from "vitest";
import type { FinanceClient } from "@/lib/finance/queries";
import type { Alert } from "@/lib/finance/types";
import { dispatchTelegramAlerts } from "@/lib/telegram/dispatch";

function pendingAlert(): Alert {
  return {
    id: "6f1c3a2e-7b14-4d0a-8f31-9c0a6b2d4e18",
    user_id: "user",
    rule: "وزن طلا از حداکثر گذشت",
    threshold: 3,
    channel: "in_app",
    is_active: true,
    frequency: "daily",
    kind: "rule",
    message: null,
    asset_type: null,
    created_at: "2026-09-29T16:41:00.000Z",
    sent: false,
    sent_at: null,
  };
}

function client(updates: unknown[]) {
  function builder(table: string, op: "select" | "update" | "insert", payload?: unknown) {
    const self = {
      select() {
        return self;
      },
      eq() {
        return self;
      },
      in() {
        return self;
      },
      order() {
        return self;
      },
      limit() {
        return self;
      },
      then(
        onFulfilled?: (value: { data: unknown; error: null }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        const data =
          op === "select" && table === "alerts"
            ? [pendingAlert()]
            : op === "select" && table === "settings"
              ? [{ user_id: "user", telegram_chat_id: "42" }]
              : op === "select"
                ? []
                : op === "update"
                  ? [{ id: pendingAlert().id, kind: "rule" }]
                  : null;
        if (op === "update" || op === "insert") updates.push({ table, payload });
        return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
      },
    };
    return self;
  }

  return {
    from(table: string) {
      return {
        select: () => builder(table, "select"),
        update: (payload: unknown) => builder(table, "update", payload),
        insert: (payload: unknown) => builder(table, "insert", payload),
      };
    },
  } as unknown as FinanceClient;
}

describe("dispatchTelegramAlerts", () => {
  it("leaves sent false when Telegram rejects the message", async () => {
    const previous = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = "123456:test";
    const updates: unknown[] = [];
    let called = false;

    try {
      const result = await dispatchTelegramAlerts(client(updates), {
        now: new Date("2026-09-29T16:41:00.000Z"),
        send: async () => {
          called = true;
          return { ok: false, description: "Forbidden" };
        },
      });

      expect(called).toBe(true);
      expect(result).toMatchObject({ ok: true, sent: 0, failed: 1 });
      expect(updates).toEqual([]);
    } finally {
      if (previous == null) delete process.env.TELEGRAM_BOT_TOKEN;
      else process.env.TELEGRAM_BOT_TOKEN = previous;
    }
  });

  it("marks the row sent only after Telegram accepts it", async () => {
    const previous = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = "123456:test";
    const updates: unknown[] = [];

    try {
      const result = await dispatchTelegramAlerts(client(updates), {
        now: new Date("2026-09-29T16:41:00.000Z"),
        send: async () => ({ ok: true }),
      });

      expect(result).toMatchObject({ ok: true, sent: 1, failed: 0 });
      expect(updates).toContainEqual({
        table: "alerts",
        payload: { sent: true, sent_at: "2026-09-29T16:41:00.000Z" },
      });
    } finally {
      if (previous == null) delete process.env.TELEGRAM_BOT_TOKEN;
      else process.env.TELEGRAM_BOT_TOKEN = previous;
    }
  });
});
