import { describe, expect, it } from "vitest";
import { bestFor, biggestChange, type ChannelFigures } from "./channelPicks";

const row = (key: string, visits: number, visitsBefore: number | null, wins = 0): ChannelFigures => ({ key, visits, visitsBefore, wins });

describe("biggestChange", () => {
  it("takes the biggest move, up or down", () => {
    expect(biggestChange([row("Direct", 500, 450), row("Cross-network", 2000, 3917), row("Referral", 900, 100)])).toEqual({ key: "Cross-network", change: -1917 });
    expect(biggestChange([row("Direct", 500, 450), row("Referral", 900, 100)])).toEqual({ key: "Referral", change: 800 });
  });

  it("leaves out a channel with nothing held before, and says nothing when nothing moved", () => {
    expect(biggestChange([row("Direct", 500, null)])).toBeNull();
    expect(biggestChange([row("Direct", 500, 500)])).toBeNull();
    expect(biggestChange([])).toBeNull();
  });

  it("breaks a tie the same way every time", () => {
    expect(biggestChange([row("Small", 100, 150), row("Big", 900, 950)])?.key).toBe("Big");
    expect(biggestChange([row("Beta", 100, 150), row("Alpha", 100, 150)])?.key).toBe("Alpha");
  });
});

describe("bestFor", () => {
  it("takes the highest rate among channels with enough visits", () => {
    const picked = bestFor([row("Organic Search", 13000, null, 290), row("Paid Search", 1100, null, 100)]);
    expect(picked?.key).toBe("Paid Search");
    expect(picked?.per100).toBeCloseTo(9.09, 1);
  });

  it("leaves out a channel under 100 visits, as Email would win with 1 sale from 9 visits", () => {
    expect(bestFor([row("Email", 9, null, 1), row("Direct", 1000, null, 10)])?.key).toBe("Direct");
    expect(bestFor([row("Email", 9, null, 1)])).toBeNull();
  });

  it("says nothing when nothing was won", () => {
    expect(bestFor([row("Direct", 1000, null, 0)])).toBeNull();
  });
});
