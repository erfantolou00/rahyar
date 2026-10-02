import { describe, expect, it } from "vitest";
import type { FinanceClient } from "@/lib/finance/queries";
import type { Alert } from "@/lib/finance/types";
import { dispatchAlertNotifications } from "@/lib/notify/dispatch";
import type { PushTarget } from "@/lib/notify/push";

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

const subscription: PushTarget & { user_id: string } = {
  id: "sub",
  user_id: "user",
  endpoint: "https://push.example/subscription",
  p256dh: "key",
  auth: "auth",
};

function client(
  updates: unknown[],
  rows?: { settings?: { user_id: string; bale_chat_id: string | null }[]; subscriptions?: unknown[] },
) {
  function builder(table: string, op: "select" | "update" | "insert" | "delete", payload?: unknown) {
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
            : op === "select" && table === "push_subscriptions"
              ? (rows?.subscriptions ?? [subscription])
              : op === "select" && table === "settings"
                ? (rows?.settings ?? [])
              : op === "select"
                ? []
                : op === "update"
                  ? [{ id: pendingAlert().id, kind: "rule" }]
                  : null;
        if (op === "update" || op === "insert" || op === "delete") updates.push({ table, op, payload });
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
        delete: () => builder(table, "delete"),
      };
    },
  } as unknown as FinanceClient;
}

describe("dispatchAlertNotifications", () => {
  it("leaves sent false when the browser rejects the push", async () => {
    const updates: unknown[] = [];
    let called = false;
    const result = await dispatchAlertNotifications(client(updates), {
      now: new Date("2026-09-29T16:41:00.000Z"),
      send: async () => {
        called = true;
        return { ok: false, description: "gone", gone: false };
      },
    });

    expect(called).toBe(true);
    expect(result).toMatchObject({ ok: true, sent: 0, failed: 1 });
    expect(updates).toEqual([]);
  });

  it("marks the row sent only after a browser accepts the push", async () => {
    const updates: unknown[] = [];
    const result = await dispatchAlertNotifications(client(updates), {
      now: new Date("2026-09-29T16:41:00.000Z"),
      send: async () => ({ ok: true }),
    });

    expect(result).toMatchObject({ ok: true, sent: 1, failed: 0 });
    expect(updates).toContainEqual({
      table: "alerts",
      op: "update",
      payload: { sent: true, sent_at: "2026-09-29T16:41:00.000Z" },
    });
  });

  it("marks the row sent when only Bale accepts the message", async () => {
    const updates: unknown[] = [];
    const result = await dispatchAlertNotifications(
      client(updates, { subscriptions: [], settings: [{ user_id: "user", bale_chat_id: "42" }] }),
      {
        now: new Date("2026-09-29T16:41:00.000Z"),
        send: async () => ({ ok: false, description: "unused", gone: false }),
        sendBale: async () => ({ ok: true }),
      },
    );

    expect(result).toMatchObject({ ok: true, sent: 1, failed: 0, missingSubscription: false });
  });

  it("leaves sent false when Bale rejects the message", async () => {
    const updates: unknown[] = [];
    const result = await dispatchAlertNotifications(
      client(updates, { subscriptions: [], settings: [{ user_id: "user", bale_chat_id: "42" }] }),
      {
        now: new Date("2026-09-29T16:41:00.000Z"),
        sendBale: async () => ({ ok: false, description: "chat not found" }),
      },
    );

    expect(result).toMatchObject({ ok: true, sent: 0, failed: 1 });
    expect(updates).toEqual([]);
  });

  it("asks for a channel when neither browser nor Bale is configured", async () => {
    const result = await dispatchAlertNotifications(client([], { subscriptions: [] }), {
      now: new Date("2026-09-29T16:41:00.000Z"),
      send: async () => ({ ok: true }),
      sendBale: async () => ({ ok: true }),
    });

    expect(result).toMatchObject({ ok: true, sent: 0, missingSubscription: true });
  });
});
