import { describe, expect, test } from "vitest";
import { expectEyeHolds } from "@/src/test/eyeHolds";
import { readFixture } from "@/src/test/readFixture";
import { findingWords, type Finding } from "./findings";
import { pageDataFor } from "./pageData";
import { pageFindings } from "./pageFindings";

const fixture = readFixture("moreHandlesDashboard");

/**
 * The client Dashboard's own findings on every period its date menu offers, on More Handles' figures as
 * `dashboard.dashboardFigures` read them on 21 November 2026 (dashboard-way-1-plan-2026-11-21.md, "The eye"; Anthony,
 * 2026-11-03: "we have a date selection picker FFS … please add this to your tests"). More Handles is a shop, so what was
 * done is its sales, the Bought box.
 *
 * Search Console keeps 16 months, and the Dashboard's clicks have no span before on the last 6 and 12 months: there the eye
 * says nothing about clicks moving. On every other period it finds the biggest move first, and at least four things.
 */

type Period = "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "last3Months" | "last6Months" | "last12Months";
const PERIODS: readonly Period[] = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last3Months", "last6Months", "last12Months"];
/** The periods with no span before in Search Console, on More Handles' figures. */
const NO_CONSOLE_BEFORE: readonly Period[] = ["last6Months", "last12Months"];

const SCREEN = "dashboard.home";

function said(data: unknown): { findings: Finding[]; words: string[] } {
  expectEyeHolds(SCREEN, data);
  const findings = pageFindings(SCREEN, pageDataFor(data, SCREEN));
  return { findings, words: findings.map(findingWords) };
}

/** Never money, and never a source the figures don't hold: Bing, Clarity and the Visibility estimates have their own sections. */
function plain(words: readonly string[]) {
  const all = words.join("\n");
  // Sales are counted, as the Bought box counts them: never what they were worth.
  expect(all).not.toMatch(/£|\$|€|revenue|\bworth\b|\bearn|sales value/i);
  expect(all).not.toMatch(/\bBing\b|\bClarity\b|estimate/i);
}

describe("the Dashboard's own findings, on every period", () => {
  test.each(PERIODS)("%s: the biggest move first, never a claim with no span before", (period) => {
    const data = fixture[period];
    const { findings, words } = said(data);
    plain(words);
    // Ranked by how far each moved, so the first is the biggest.
    const scores = findings.map((one) => one.score);
    expect(scores, words.join("\n")).toEqual([...scores].sort((a, b) => b - a));
    if (NO_CONSOLE_BEFORE.includes(period)) {
      expect(findings.filter((one) => one.id.includes(":searchConsole:")), words.join("\n")).toEqual([]);
      expect(findings.length, words.join("\n")).toBeGreaterThanOrEqual(3);
    } else {
      expect(findings.length, words.join("\n")).toBeGreaterThanOrEqual(4);
    }
    // A shop's: sales, as its Bought box and the redone Overview count them, never "purchases" or "conversions".
    expect(words.join("\n")).not.toMatch(/conversion|purchase/i);
  });

  test("last month leads with what moved most, and says each move the right way", () => {
    // More Handles in October 2026 against September: visits 35,739 from 37,507, sales 1,207 from 1,258, clicks 7,124
    // from 7,518, times shown 842,984 from 821,376.
    const { findings, words } = said(fixture.lastMonth);
    const byMeasure = new Map(findings.map((one) => [String(one.params.measure), one]));
    expect(byMeasure.get("visits")?.kind, words.join("\n")).toBe("wholeDown");
    expect(byMeasure.get("sales")?.kind, words.join("\n")).toBe("wholeDown");
    expect(byMeasure.get("clicks")?.kind, words.join("\n")).toBe("wholeDown");
    expect(byMeasure.get("impressions")?.kind, words.join("\n")).toBe("wholeUp");
    // Fewer clicks from more times shown: the clicks for every 1,000 fell.
    expect(byMeasure.get("clicksPerThousand")?.kind, words.join("\n")).toBe("wholeDown");
  });
});

describe("the Dashboard's own findings, for every company", () => {
  test("a business with no shop counts events, as its Events box does, and the visits it took for one", () => {
    const data = { ...fixture.lastMonth, shop: false };
    const { words } = said(data);
    expect(words.join("\n")).toMatch(/\bevents?\b/i);
    expect(words.join("\n")).not.toMatch(/sale|purchase|conversion/i);
  });

  test("a source switched off says nothing", () => {
    const { findings } = said({ ...fixture.lastMonth, searchConsole: null });
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.filter((one) => one.id.includes(":searchConsole:"))).toEqual([]);
    expect(said({ ...fixture.lastMonth, analytics: null }).findings.filter((one) => one.id.includes(":analytics:"))).toEqual([]);
  });

  test("a move too small to trust is left out", () => {
    const flat = { now: 1000, before: 1005, days: [] };
    const { findings } = said({ sites: [], shop: true, analytics: { visits: flat, done: { now: 3, before: 1, days: [] } }, searchConsole: null });
    // Visits moved half a percent; three sales from one is too few to weigh.
    expect(findings).toEqual([]);
  });
});
