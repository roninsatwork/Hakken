import { describe, expect, test } from "vitest";

import {
  VERDICT_THRESHOLDS,
  daysBetween,
  pullsPerMonth,
  questionVerdict,
  rivalVerdict,
  searchVerdict,
} from "./trackingVerdicts";

/**
 * The verdicts, at their thresholds.
 *
 * Each threshold is tested on both sides of its line, because a verdict is an
 * opinion with money attached and the line is exactly where somebody will
 * argue with it.
 */

const TODAY = "2026-09-22";
const daysAgo = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * 86_400_000)
  .toISOString().slice(0, 10);

describe("a search", () => {
  test("never checked says so, rather than guessing", () => {
    expect(searchVerdict(null, TODAY)).toBe("NOT_CHECKED");
  });

  test("slipping is more than three places down since the check before", () => {
    const base = { firstCheckedDay: daysAgo(90), everRanked: true };
    expect(searchVerdict({ ...base, previousPosition: 4, lastPosition: 8 }, TODAY)).toBe("SLIPPING");
    expect(searchVerdict({ ...base, previousPosition: 4, lastPosition: 7 }, TODAY)).toBe("PAGE_ONE");
    // Falling off the page altogether is the worst kind of slipping.
    expect(searchVerdict({ ...base, previousPosition: 6 }, TODAY)).toBe("SLIPPING");
  });

  test("page one shows even in its first month", () => {
    expect(searchVerdict({ firstCheckedDay: daysAgo(3), lastPosition: 2, everRanked: true }, TODAY)).toBe("TOP_THREE");
    expect(searchVerdict({ firstCheckedDay: daysAgo(3), lastPosition: 9, everRanked: true }, TODAY)).toBe("PAGE_ONE");
  });

  test("too new, then not found, then never ranked", () => {
    const unfound = (age: number) => searchVerdict({ firstCheckedDay: daysAgo(age), everRanked: false }, TODAY);
    expect(unfound(VERDICT_THRESHOLDS.tooNewDays - 1)).toBe("TOO_NEW");
    expect(unfound(VERDICT_THRESHOLDS.tooNewDays)).toBe("NOT_FOUND");
    expect(unfound(VERDICT_THRESHOLDS.neverRankedDays)).toBe("NEVER_RANKED");
  });

  test("a search that once ranked is never 'never ranked'", () => {
    expect(searchVerdict({ firstCheckedDay: daysAgo(200), everRanked: true }, TODAY)).toBe("NOT_FOUND");
  });
});

describe("a question", () => {
  const since = (age: number) => daysAgo(age);

  test("warned against beats everything", () => {
    expect(questionVerdict({ asked: 10, named: 9, warnedAgainst: 1, firstAskedDay: since(90) }, TODAY)).toBe("WARNED");
  });

  test("earning its keep is named in at least half the answers", () => {
    expect(questionVerdict({ asked: 10, named: 5, warnedAgainst: 0, firstAskedDay: since(90) }, TODAY)).toBe("EARNING");
    expect(questionVerdict({ asked: 10, named: 4, warnedAgainst: 0, firstAskedDay: since(90) }, TODAY)).toBe("THIN");
  });

  test("never landed only after the threshold, and never before", () => {
    const zero = (age: number) => questionVerdict({ asked: 8, named: 0, warnedAgainst: 0, firstAskedDay: since(age) }, TODAY);
    expect(zero(VERDICT_THRESHOLDS.tooNewDays - 1)).toBe("TOO_NEW");
    expect(zero(VERDICT_THRESHOLDS.neverLandedDays - 1)).toBe("THIN");
    expect(zero(VERDICT_THRESHOLDS.neverLandedDays)).toBe("NEVER_LANDED");
  });

  test("an unasked question is not a failing one", () => {
    expect(questionVerdict(null, TODAY)).toBe("NOT_ASKED");
    expect(questionVerdict({ asked: 0, named: 0, warnedAgainst: 0, firstAskedDay: TODAY }, TODAY)).toBe("NOT_ASKED");
  });
});

describe("a rival", () => {
  test("ahead, behind, level, and gone quiet", () => {
    const base = { trackedSinceDay: daysAgo(90), lastSeenDay: daysAgo(3) };
    expect(rivalVerdict({ ...base, beatsYouOn: 5, youBeatOn: 2 }, TODAY)).toBe("AHEAD");
    expect(rivalVerdict({ ...base, beatsYouOn: 1, youBeatOn: 2 }, TODAY)).toBe("BEHIND");
    expect(rivalVerdict({ ...base, beatsYouOn: 2, youBeatOn: 2 }, TODAY)).toBe("LEVEL");
    expect(rivalVerdict({ ...base, lastSeenDay: daysAgo(VERDICT_THRESHOLDS.goneQuietDays), beatsYouOn: 0, youBeatOn: 0 }, TODAY))
      .toBe("GONE_QUIET");
    expect(rivalVerdict({ ...base, trackedSinceDay: daysAgo(2), beatsYouOn: 9, youBeatOn: 0 }, TODAY)).toBe("TOO_NEW");
  });
});

describe("turning a price into a monthly cost", () => {
  const every = (cadence: string) => JSON.stringify({ version: 2, kind: "recurring", cadence, timeLocal: "09:00", timezone: "UTC" });

  test("each cadence the schedule can produce", () => {
    expect(pullsPerMonth(every("daily"))).toBeCloseTo(30.42, 1);
    expect(pullsPerMonth(every("weekly"))).toBeCloseTo(4.33, 1);
    expect(pullsPerMonth(every("fortnightly"))).toBeCloseTo(2.17, 1);
    expect(pullsPerMonth(every("monthly"))).toBe(1);
  });

  test("anything else is unknown, never a guess", () => {
    expect(pullsPerMonth(null)).toBeNull();
    expect(pullsPerMonth("not json")).toBeNull();
    expect(pullsPerMonth(every("hourly"))).toBeNull();
  });

  test("days between two days", () => {
    expect(daysBetween("2026-09-01", "2026-09-22")).toBe(21);
  });
});
