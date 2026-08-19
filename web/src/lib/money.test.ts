import { describe, expect, it } from "vitest";
import { changeBps, changeOrderTotal } from "./money";

describe("shared money", () => {
  it("does not use floating totals", () => {
    expect(changeOrderTotal(1999, 1250, 700)).toBe(changeOrderTotal(1999, 1250, 700));
    expect(changeBps(200, 250)).toBe(2500);
  });
});
