import { describe, expect, it } from "vitest";
import { isListedSession, latestListedSessionDay, listedQuoteStale } from "@/lib/finance/prices/session";

describe("listed market session", () => {
  it("is open Saturday through Wednesday from 09:00 until 13:00 Tehran", () => {
    expect(isListedSession(new Date("2026-10-10T05:30:00.000Z"))).toBe(true);
    expect(isListedSession(new Date("2026-10-10T05:29:00.000Z"))).toBe(false);
    expect(isListedSession(new Date("2026-10-14T09:29:00.000Z"))).toBe(true);
    expect(isListedSession(new Date("2026-10-14T09:30:00.000Z"))).toBe(false);
    expect(isListedSession(new Date("2026-10-15T06:00:00.000Z"))).toBe(false);
    expect(isListedSession(new Date("2026-10-16T06:00:00.000Z"))).toBe(false);
  });

  it("keeps the last session's close after the market shuts", () => {
    const thursday = new Date("2026-10-15T12:30:00.000Z");
    expect(latestListedSessionDay(thursday)).toBe(20261014);
    expect(listedQuoteStale("2026-10-14T09:15:00.000Z", thursday)).toBe(false);
    expect(listedQuoteStale("2026-10-13T09:15:00.000Z", thursday)).toBe(true);
  });

  it("treats an hour-old quote as stale only while the session is open", () => {
    const noon = new Date("2026-10-14T08:30:00.000Z");
    expect(listedQuoteStale("2026-10-14T05:30:00.000Z", noon)).toBe(true);
    expect(listedQuoteStale("2026-10-14T08:00:00.000Z", noon)).toBe(false);
  });

  it("looks back to Wednesday before Saturday's open", () => {
    expect(latestListedSessionDay(new Date("2026-10-10T04:30:00.000Z"))).toBe(20261007);
  });
});
