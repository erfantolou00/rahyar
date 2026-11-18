import { describe, expect, it } from "vitest";
import { FIS_PROPOSAL_VERSION } from "@/lib/finance/fis";
import { parseFisContent } from "@/lib/finance/publish-fis";

const factor = { key: "forward_pe", label: "نسبت قیمت به سود آینده‌نگر", max: 15, score: 0, value: 6, note: null };

describe("parseFisContent", () => {
  it("keeps the seasonal forward ratio beside the linear one", () => {
    const parsed = parseFisContent({
      schema: FIS_PROPOSAL_VERSION,
      akhza_percent: 30,
      inflation_percent: 25,
      inflation_fallback: false,
      buy_pe: 5,
      exit_pe: 10,
      stocks: [{
        symbol: "فولاد",
        owned: true,
        status: "watch",
        label: "بررسی",
        reason: "",
        score: 40,
        previous_score: null,
        forward_pe: 6,
        forward_pe_seasonal: 5,
        seasonal_gaps: ["تاریخچهٔ صورت برای نسبت فصلی ذخیره نشده است."],
        factors: [factor],
        gaps: [],
      }],
    });
    expect(parsed?.stocks[0]?.forward_pe).toBe(6);
    expect(parsed?.stocks[0]?.forward_pe_seasonal).toBe(5);
    expect(parsed?.stocks[0]?.seasonal_gaps).toEqual(["تاریخچهٔ صورت برای نسبت فصلی ذخیره نشده است."]);
  });

  it("leaves the seasonal ratio empty on a report stored before it existed", () => {
    const parsed = parseFisContent({
      schema: FIS_PROPOSAL_VERSION,
      akhza_percent: 30,
      stocks: [{
        symbol: "فولاد",
        status: "watch",
        forward_pe: 6,
        factors: [factor],
      }],
    });
    expect(parsed?.stocks[0]?.forward_pe_seasonal).toBeNull();
    expect(parsed?.stocks[0]?.seasonal_gaps).toEqual([]);
  });
});
