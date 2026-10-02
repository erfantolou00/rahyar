import { describe, expect, it } from "vitest";
import { deviationShouldRequeue } from "@/lib/finance/allocation-alerts";

const now = new Date("2026-10-02T14:20:00.000Z");

describe("deviationShouldRequeue", () => {
  it("leaves an unsent row queued", () => {
    expect(deviationShouldRequeue(false, null, "daily", now, false)).toBe(false);
  });

  it("queues again when the sentence changes", () => {
    expect(deviationShouldRequeue(true, now.toISOString(), "daily", now, true)).toBe(true);
  });

  it("waits inside the daily window when the sentence is unchanged", () => {
    expect(deviationShouldRequeue(true, "2026-10-02T13:16:00.000Z", "daily", now, false)).toBe(false);
  });

  it("queues an unchanged deviation after the daily window", () => {
    expect(deviationShouldRequeue(true, "2026-09-29T16:59:00.000Z", "daily", now, false)).toBe(true);
  });

  it("does not repeat while the kind is off", () => {
    expect(deviationShouldRequeue(true, "2026-09-29T16:59:00.000Z", "off", now, false)).toBe(false);
  });
});
