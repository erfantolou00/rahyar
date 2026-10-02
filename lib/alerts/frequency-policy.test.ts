import { describe, expect, it } from "vitest";
import { deliveryDecision } from "@/lib/alerts/frequency-policy";

const now = new Date("2026-09-29T16:41:00.000Z");

describe("deliveryDecision", () => {
  it("sends immediate alerts even when one was just delivered", () => {
    expect(deliveryDecision("immediate", now.toISOString(), now)).toBe("send");
  });

  it("sends the first daily or weekly alert", () => {
    expect(deliveryDecision("daily", null, now)).toBe("send");
    expect(deliveryDecision("weekly", null, now)).toBe("send");
  });

  it("waits inside the daily and weekly windows", () => {
    const twentyThreeHours = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();
    const sixDays = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
    expect(deliveryDecision("daily", twentyThreeHours, now)).toBe("wait");
    expect(deliveryDecision("weekly", sixDays, now)).toBe("wait");
  });

  it("sends again once the window has elapsed", () => {
    const oneDay = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const oneWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(deliveryDecision("daily", oneDay, now)).toBe("send");
    expect(deliveryDecision("weekly", oneWeek, now)).toBe("send");
  });

  it("skips a kind that is turned off without consuming the row", () => {
    expect(deliveryDecision("off", null, now)).toBe("skip");
  });
});
