import { describe, expect, test } from "vitest";
import { beforeOf, openingPeriod, periodById, periodsFrom, yearAgoOf } from "./insightPeriods";
import { roundedParts, splitMove, whyEnquiriesMoved, type WhyInput } from "./insightWhy";

/**
 * The periods Insights reads and why the enquiries moved
 * (docs/plans/active/insights-intelligence-plan.md, phases 1 and 8), on
 * ronins.co.uk's September 2026 against September 2025 as Hakken holds them.
 */

const months = (from: string, count: number) => Array.from({ length: count }, (_, at) => {
  const [year, month] = from.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + at, 1));
  return date.toISOString().slice(0, 7);
});

describe("the periods a reader chooses", () => {
  test("whole months, calendar quarters whose three months are held, and the last twelve months, newest first", () => {
    const periods = periodsFrom(months("2025-07", 15));
    expect(periods[0]).toMatchObject({ id: "12M", kind: "YEAR", months: months("2025-10", 12) });
    expect(periods.filter((period) => period.kind === "QUARTER").map((period) => period.id)).toEqual(["2026-Q3", "2026-Q2", "2026-Q1", "2025-Q4", "2025-Q3"]);
    expect(openingPeriod(periods)?.id).toBe("2026-09");
    expect(periodById("2025-Q2", periods)).toBeNull();
  });

  test("each compared with the period before and the same period a year ago; twelve months has no year before", () => {
    const periods = periodsFrom(months("2025-07", 15));
    const quarter = periodById("2026-Q3", periods)!;
    expect(beforeOf(quarter)).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(yearAgoOf(quarter)).toEqual(["2025-07", "2025-08", "2025-09"]);
    expect(beforeOf(periodById("2026-01", periods)!)).toEqual(["2025-12"]);
    expect(yearAgoOf(periodById("12M", periods)!)).toBeNull();
  });
});

describe("why the enquiries moved", () => {
  // Ronins, September 2026 against September 2025: 10 enquiries against 26, from 240 visits against 366, while
  // Analytics counted 45 of each 100 people Google sent against 59.
  const september: WhyInput = {
    enquiries: { now: 10, then: 26 },
    visits: { now: 240, then: 366 },
    share: { now: 0.45, then: 0.59 },
    rivals: { now: 6132, then: 17160 },
    service: { shown: { now: 218788, then: 277886 }, clicks: { now: 125, then: 140 }, position: { now: 20.7, then: 35.8 }, best: { month: "2026-03", position: 17.5 } },
    pageOne: { now: 91, before: 115 },
    aiOverviews: { with: 106, of: 161 },
    shownComparable: true,
    sources: [
      { key: "Google", now: 177, then: 247 }, { key: "AI assistants", now: 6, then: 32 }, { key: "Other search engines", now: 3, then: 20 }, { key: "Typed in", now: 43, then: 56 },
    ],
    kinds: [
      { key: "Service", service: true, visits: { now: 92, then: 149 }, enquiries: { now: 4, then: 13 } },
      { key: "Brand", service: false, visits: { now: 53, then: 84 }, enquiries: { now: 3, then: 10 } },
    ],
  };

  test("splits the 16 fewer enquiries into counting, visitors and enquiring, adding up to the whole", () => {
    expect(splitMove(september)).toEqual({ counting: 3, visits: 4, rate: 9 });
    expect(whyEnquiriesMoved(september).lost).toBe(16);
  });

  test("a share that held is not counting: the parts are visitors and enquiring only", () => {
    expect(splitMove({ ...september, share: { now: 0.58, then: 0.59 } })).toEqual({ counting: 0, visits: 9, rate: 7 });
  });

  test("each test's verdict, service pages first", () => {
    const why = whyEnquiriesMoved(september);
    const verdict = Object.fromEntries(why.tests.map((test) => [test.id, test.verdict]));
    expect(verdict).toEqual({ COUNTING: "LIKELY", MARKET: "LIKELY", RANKINGS: "WATCH", SHOWN: "PART", SOURCES: "LIKELY", CONVERSION: "BIGGEST" });
    const sources = why.tests.find((test) => test.id === "SOURCES")!;
    // Google's visitors fell 28%, under the bar: the sources named are the two that almost stopped.
    expect([sources.figures.source0, sources.figures.source1, sources.figures.source2]).toEqual(["AI assistants", "Other search engines", undefined]);
    expect(why.tests.find((test) => test.id === "CONVERSION")!.figures).toMatchObject({ serviceRateNow: 4.3, serviceRateThen: 8.7 });
  });

  test("times shown and place are not compared across the month Google changed what it counts", () => {
    const why = whyEnquiriesMoved({ ...september, shownComparable: false });
    expect(why.tests.find((test) => test.id === "SHOWN")!.verdict).toBe("NO_DATA");
    expect(why.tests.find((test) => test.id === "RANKINGS")!.figures.positionThen).toBeNull();
  });

  test("a rise splits the same way, the other way round", () => {
    const rose = splitMove({ enquiries: { now: 10, then: 7 }, visits: { now: 240, then: 201 }, share: { now: 0.45, then: 0.44 } });
    expect(rose.counting + rose.visits + rose.rate).toBe(-3);
  });

  test("rounding keeps the parts adding up", () => {
    expect(roundedParts([3.4, 3.4, 3.4], 10)).toEqual([4, 3, 3]);
    expect(roundedParts([], 0)).toEqual([]);
  });
});
