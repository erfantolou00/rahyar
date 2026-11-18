import { describe, expect, it } from "vitest";
import { tradeErrorCode } from "@/lib/finance/trade-error";

describe("tradeErrorCode", () => {
  it("names an oversell", () => {
    expect(tradeErrorCode({ code: "23514", message: "oversell" })).toBe("oversell");
  });

  it("names a missing cash account", () => {
    expect(tradeErrorCode({ code: "23514", message: "cash" })).toBe("cash");
  });

  it("rejects a sell of cash as the wrong ledger entry", () => {
    expect(tradeErrorCode({ code: "22023", message: "ledger" })).toBe("ledger");
    expect(tradeErrorCode({ code: "22023", message: "currency" })).toBe("ledger");
  });

  it("names an average correction on an empty holding", () => {
    expect(tradeErrorCode({ code: "23514", message: "empty" })).toBe("empty");
  });

  it("keeps an unknown failure as a save error", () => {
    expect(tradeErrorCode({ code: "42501", message: "permission denied for table transactions" })).toBe("save");
  });
});
