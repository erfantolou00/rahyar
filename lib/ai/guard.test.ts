import { describe, expect, it } from "vitest";
import { readCompletionText } from "@/lib/ai/gapgpt";
import { fivePersianLines } from "@/lib/ai/lines";
import { replyUsesKnownNumbers } from "@/lib/ai/numbers";
import { chatSystemPrompt, type ChatFacts } from "@/lib/ai/prompt";
import { CHAT_POLICY, resetRateLimits, takeRateSlot } from "@/lib/ai/rate-limit";

const facts: ChatFacts = {
  portfolio: { totalValue: 8549935810, holdings: [], byType: [] },
  activeAlertCount: 0,
  activeAlerts: [],
  latestWeeklyReport: null,
};

describe("replyUsesKnownNumbers", () => {
  it("allows a number that is already in the facts", () => {
    expect(replyUsesKnownNumbers("ارزش ۱۵۰ است", [{ total: 150 }])).toBe(true);
    expect(replyUsesKnownNumbers("وزن ۱۰٫۶۳ است", [{ weight: 10.634 }])).toBe(true);
  });

  it("rejects a number the facts do not contain", () => {
    expect(replyUsesKnownNumbers("ارزش ۱۵ است", [{ total: 150 }])).toBe(false);
    expect(replyUsesKnownNumbers("حدود ۹۹۹", [{ total: 150 }])).toBe(false);
  });
});

describe("chatSystemPrompt", () => {
  it("puts the calculated facts in the prompt", () => {
    const prompt = chatSystemPrompt(facts);
    expect(prompt).toContain("8549935810");
    expect(prompt).toContain("عدد نساز");
  });
});

describe("takeRateSlot", () => {
  it("blocks a burst and then the window cap", () => {
    resetRateLimits();
    const now = 1_000_000;
    const policy = { ...CHAT_POLICY, limit: 2, windowMs: 10_000, minGapMs: 1_000 };
    expect(takeRateSlot("user", now, policy).ok).toBe(true);
    expect(takeRateSlot("user", now + 100, policy).ok).toBe(false);
    expect(takeRateSlot("user", now + 1_000, policy).ok).toBe(true);
    expect(takeRateSlot("user", now + 2_000, policy).ok).toBe(false);
  });
});

describe("model response helpers", () => {
  it("reads string and array completion content", () => {
    expect(readCompletionText({ choices: [{ message: { content: " سلام " } }] })).toBe("سلام");
    expect(readCompletionText({ choices: [{ message: { content: [{ text: "یک" }, { text: " دو" }] } }] })).toBe("یک دو");
    expect(readCompletionText({})).toBeNull();
  });

  it("accepts exactly five lines and strips list markers", () => {
    expect(fivePersianLines("یک\nدو\nسه\nچهار\nپنج")).toEqual(["یک", "دو", "سه", "چهار", "پنج"]);
    expect(fivePersianLines("1. یک\n2. دو\n3. سه\n4. چهار\n5. پنج")).toEqual(["یک", "دو", "سه", "چهار", "پنج"]);
    expect(fivePersianLines("یک\nدو")).toBeNull();
  });
});
