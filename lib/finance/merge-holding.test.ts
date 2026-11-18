import { describe, expect, it } from "vitest";
import { blendAverageBuy, earlierIsoDate, findListedMatch, sameHoldingSymbol } from "@/lib/finance/merge-holding";

describe("merge holding", () => {
  it("treats spaced and arabic-yeh spellings as the same symbol", () => {
    expect(sameHoldingSymbol(" فولاد ", "فولاد")).toBe(true);
    expect(sameHoldingSymbol("فملی", "شبندر")).toBe(false);
  });

  it("weights the new buy into the old average", () => {
    expect(blendAverageBuy(100, 10, 100, 20)).toBe(15);
  });

  it("keeps the old average when the new price is empty", () => {
    expect(blendAverageBuy(100, 10, 50, null)).toBe(10);
  });

  it("keeps the earlier purchase date", () => {
    expect(earlierIsoDate("2026-01-02", "2026-03-01")).toBe("2026-01-02");
    expect(earlierIsoDate(null, "2026-03-01")).toBe("2026-03-01");
  });

  it("picks the oldest matching row", () => {
    const match = findListedMatch(
      [
        { symbol: "فولاد", created_at: "2026-05-01" },
        { symbol: "فولاد ", created_at: "2026-01-01" },
      ],
      "فولاد",
    );
    expect(match?.created_at).toBe("2026-01-01");
  });
});