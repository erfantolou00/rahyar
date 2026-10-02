import { describe, expect, it } from "vitest";
import { formatNumber, toNumber } from "@/lib/finance/format";
import { formatAlertMessage } from "@/lib/alerts/format";
import type { Alert } from "@/lib/finance/types";

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: "alert",
    user_id: "user",
    rule: "allocation_deviation",
    threshold: 12.5,
    channel: "in_app",
    is_active: true,
    frequency: "display_only",
    kind: "allocation_deviation",
    message: "وزن طلا از حداکثر محدوده گذشته است.",
    asset_type: "gold",
    created_at: "2026-09-29T16:41:00.000Z",
    sent: false,
    sent_at: null,
    ...overrides,
  };
}

describe("formatAlertMessage", () => {
  it("writes a Persian notice instead of the raw row", () => {
    const text = formatAlertMessage(alert());

    expect(text.startsWith("هشدار رهیار")).toBe(true);
    expect(text).toContain("نوع: انحراف تخصیص");
    expect(text).toContain("دارایی: طلا");
    expect(text).toContain("شرح: وزن طلا از حداکثر محدوده گذشته است.");
    expect(text).toContain(`آستانه: ${formatNumber(toNumber(12.5))}`);
    expect(text).not.toContain('"kind"');
    expect(text).not.toContain("{");
  });

  it("falls back to the rule text when there is no message", () => {
    const text = formatAlertMessage(
      alert({ kind: "rule", message: null, asset_type: null, rule: "وزن طلا از حداکثر گذشت" }),
    );

    expect(text).toContain("نوع: قاعدهٔ دستی");
    expect(text).toContain("شرح: وزن طلا از حداکثر گذشت");
    expect(text).not.toContain("دارایی:");
  });
});
