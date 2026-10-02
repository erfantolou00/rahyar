import { describe, expect, it } from "vitest";
import { cronAuthorized } from "@/lib/cron/auth";

describe("cronAuthorized", () => {
  it("accepts the bearer secret", () => {
    expect(cronAuthorized("Bearer weekly-secret", "weekly-secret")).toBe(true);
  });

  it("rejects a missing, wrong, or shorter secret", () => {
    expect(cronAuthorized(null, "weekly-secret")).toBe(false);
    expect(cronAuthorized("Bearer weekly-secret", null)).toBe(false);
    expect(cronAuthorized("Bearer other-secret", "weekly-secret")).toBe(false);
    expect(cronAuthorized("Bearer weekly", "weekly-secret")).toBe(false);
  });
});
