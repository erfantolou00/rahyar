import { describe, expect, it } from "vitest";
import { syncAppBadge, type AppBadgeNavigator } from "@/lib/pwa/badge";

function fakeNavigator() {
  const calls: string[] = [];
  const nav: AppBadgeNavigator = {
    setAppBadge(count) {
      calls.push(`set:${count}`);
      return Promise.resolve();
    },
    clearAppBadge() {
      calls.push("clear");
      return Promise.resolve();
    },
  };
  return { nav, calls };
}

describe("syncAppBadge", () => {
  it("sets the active alert count and clears it at zero", async () => {
    const badge = fakeNavigator();
    await syncAppBadge(3, badge.nav);
    await syncAppBadge(0, badge.nav);
    expect(badge.calls).toEqual(["set:3", "clear"]);
  });

  it("does nothing when the browser has no Badging API", async () => {
    await expect(syncAppBadge(2, {})).resolves.toBeUndefined();
  });

  it("swallows a rejected badge call", async () => {
    const nav: AppBadgeNavigator = {
      setAppBadge() {
        return Promise.reject(new Error("not installed"));
      },
      clearAppBadge() {
        return Promise.resolve();
      },
    };
    await expect(syncAppBadge(1, nav)).resolves.toBeUndefined();
  });
});
