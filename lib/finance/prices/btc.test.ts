import { describe, expect, it } from "vitest";
import { btcInRial, btcInUsdt } from "@/lib/finance/prices/btc";

const dollar = 2_534_150;

describe("btcInUsdt", () => {
  it("keeps a tether quote", () => {
    expect(btcInUsdt(84_400, dollar)).toBe(84_400);
  });

  it("divides a rial quote by the dollar rate", () => {
    expect(btcInUsdt(84_400 * dollar, dollar)).toBeCloseTo(84_400);
  });

  it("returns null when a rial quote has no dollar rate", () => {
    expect(btcInUsdt(84_400 * dollar, null)).toBeNull();
  });
});

describe("btcInRial", () => {
  it("multiplies a tether quote by the dollar rate", () => {
    expect(btcInRial(84_400, dollar)).toBe(84_400 * dollar);
  });

  it("keeps a quote that is already in rial", () => {
    expect(btcInRial(84_400 * dollar, dollar)).toBe(84_400 * dollar);
  });
});
