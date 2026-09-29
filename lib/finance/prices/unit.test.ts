import { describe, expect, it } from "vitest";
import { amountInRial, quoteInUnit } from "@/lib/finance/prices/unit";
import { formatQuantity } from "@/lib/finance/format";

describe("amountInRial", () => {
  it("keeps rial amounts", () => {
    expect(amountInRial(74_000, "rial", 2_500_000)).toBe(74_000);
  });

  it("converts a dollar amount with the live dollar rate", () => {
    expect(amountInRial(74_000, "usd", 2_500_000)).toBe(74_000 * 2_500_000);
  });
});

describe("quoteInUnit", () => {
  it("shows bitcoin in dollars", () => {
    expect(quoteInUnit("BTC", 84_400, "usd", 2_500_000)).toBe(84_400);
  });

  it("turns a bitcoin dollar quote into rial", () => {
    expect(quoteInUnit("BTC", 84_400, "rial", 2_500_000)).toBe(84_400 * 2_500_000);
  });
});

describe("formatQuantity", () => {
  it("keeps a fractional bitcoin", () => {
    expect(formatQuantity(0.0003)).toBe("۰٫۰۰۰۳");
  });

  it("does not add decimals to a whole quantity", () => {
    expect(formatQuantity(17_000)).toBe("۱۷٬۰۰۰");
  });
});
