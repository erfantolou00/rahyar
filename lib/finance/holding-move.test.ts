import { describe, expect, it } from "vitest";
import { projectHoldingMove } from "@/lib/finance/holding-move";

describe("projectHoldingMove", () => {
  it("weights the new purchase into the average", () => {
    expect(
      projectHoldingMove({ move: "add", quantity: 10, average: 100, amount: 10, price: 150 }),
    ).toEqual({ ok: true, quantity: 20, average: 125 });
  });

  it("keeps the average when some units are removed", () => {
    expect(
      projectHoldingMove({ move: "remove", quantity: 10, average: 100, amount: 4, price: 180 }),
    ).toEqual({ ok: true, quantity: 6, average: 100 });
  });

  it("refuses a removal larger than the holding", () => {
    expect(
      projectHoldingMove({ move: "remove", quantity: 2, average: 100, amount: 3, price: 180 }).ok,
    ).toBe(false);
  });

  it("replaces the average without changing the quantity", () => {
    expect(
      projectHoldingMove({ move: "average", quantity: 8, average: 100, amount: null, price: 90 }),
    ).toEqual({ ok: true, quantity: 8, average: 90 });
  });

  it("does not invent an average for an older lot that has none", () => {
    expect(
      projectHoldingMove({ move: "add", quantity: 5, average: null, amount: 5, price: 40 }),
    ).toEqual({ ok: true, quantity: 10, average: null });
  });
});
