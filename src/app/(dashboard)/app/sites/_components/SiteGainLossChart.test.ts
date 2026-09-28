import { describe, expect, it } from "vitest";
import { gainLossTicks } from "./SiteGainLossChart";

/** New and lost keywords' chart marks its axis with round steps either side of the line, the line among them. */
describe("the gain and loss chart's marks", () => {
  it("steps by 1, 2 or 5 of a power of ten, with nought at the line", () => {
    expect(gainLossTicks(9, 5)).toEqual([-5, 0, 5, 10]);
    expect(gainLossTicks(2_300, 40)).toEqual([-2_000, 0, 2_000, 4_000]);
    expect(gainLossTicks(3, 3)).toEqual([-4, -2, 0, 2, 4]);
  });

  it("keeps a step each way when nothing moved, or moved one way only", () => {
    expect(gainLossTicks(0, 0)).toEqual([-1, 0, 1]);
    expect(gainLossTicks(1, 0)).toEqual([-1, 0, 1]);
    expect(gainLossTicks(0, 7)).toEqual([-10, -5, 0, 5]);
  });
});
