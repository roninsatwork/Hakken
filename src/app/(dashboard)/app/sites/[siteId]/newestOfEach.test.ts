import { describe, expect, it } from "vitest";

import { newestOfEach } from "./newestOfEach";

/**
 * The Overview's headline never shows a dash for a figure it holds: the
 * newest day's figures, each one it has not got taken from the newest day
 * before it that has (2026-09-25).
 */
describe("the Overview's headline figures", () => {
  it("takes a figure the newest day has not got from the newest day that has it", () => {
    const latest = newestOfEach([
      { day: "2026-09-23", aiOverviewRefs: 400, estimatedTraffic: 12_000 },
      { day: "2026-09-24", aiOverviewRefs: 444, estimatedTraffic: 13_000 },
      { day: "2026-09-25", estimatedTraffic: 13_733 } as { day: string; aiOverviewRefs?: number; estimatedTraffic: number },
    ]);

    // Today's own figure where it has one; yesterday's 444 where it has not.
    expect(latest).toEqual({ day: "2026-09-25", aiOverviewRefs: 444, estimatedTraffic: 13_733 });
  });

  it("keeps a real zero, and has nothing to show for no days", () => {
    expect(newestOfEach([{ day: "a", paidKeywords: 5 }, { day: "b", paidKeywords: 0 }])).toEqual({ day: "b", paidKeywords: 0 });
    expect(newestOfEach([])).toBeNull();
  });
});
