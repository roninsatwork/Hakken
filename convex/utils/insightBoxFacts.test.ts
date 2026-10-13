import { describe, expect, test } from "vitest";
import { decisionFacts, funnelFacts, trackFacts } from "./insightBoxFacts";
import { boxScreensAt, screensByRole } from "./insightBoxes";
import { fixedRulesFor } from "./insightBriefs";
import type { Fact } from "./insightFacts";

/**
 * The Funnel, Track record and Page decisions boxes (insightBoxFacts.ts):
 * their figures worked out from what is held, so a specialist names them
 * and never works one out; each written by its own specialist.
 */

const fact = (key: string, value: number, source: Fact["source"] = "analytics"): Fact => ({ key, value, unit: "count", source, label: key, from: "2026-07-13", to: "2026-10-10" });
const value = (facts: readonly Fact[], key: string) => facts.find((entry) => entry.key === key)?.value;

describe("the boxes still in the screens' own words, written by their specialists", () => {
  test("the funnel's rates and each source's enquiry rate are worked out from the reading", () => {
    const facts = funnelFacts([
      fact("sc.impressions.90.now", 40_000, "searchConsole"), fact("sc.clicks.90.now", 400, "searchConsole"),
      fact("ga.channel.Organic Search.visits.90.now", 360), fact("ga.channel.Organic Search.conversions.90.now", 9),
      fact("ga.channel.Organic Search.visits.365.now", 1_500), fact("ga.channel.Organic Search.conversions.365.now", 30),
      fact("ga.channel.Direct.visits.365.now", 500), fact("ga.channel.Direct.conversions.365.now", 20),
    ]);
    expect(value(facts, "funnel.clickRate.now")).toBe(1);
    expect(value(facts, "funnel.visitRate.now")).toBe(90);
    expect(value(facts, "funnel.enquireRate.now")).toBe(2.5);
    expect(value(facts, "funnel.source.Direct.rate.now")).toBe(4);
    expect(value(facts, "funnel.source.Organic Search.rate.now")).toBe(2);
    expect(facts.find((entry) => entry.key === "funnel.clickRate.now")).toMatchObject({ unit: "percent", from: "2026-07-13", to: "2026-10-10" });
    // Nothing a year before, so no year's rate.
    expect(value(facts, "funnel.clickRate.year")).toBeUndefined();
  });

  test("Track record counts the website's findings as checked, and each specialist's", () => {
    const facts = trackFacts([
      { outcome: "RIGHT", specialist: "search" }, { outcome: "RIGHT", specialist: "search", actedAt: 1 }, { outcome: "WRONG", specialist: "conversion" },
      { outcome: "TOO_EARLY", specialist: "search" }, { specialist: "search" },
    ], [{ result: "GREW" }, { result: "HELD" }]);
    expect([value(facts, "track.right"), value(facts, "track.wrong"), value(facts, "track.unclear"), value(facts, "track.checked")]).toEqual([2, 1, 1, 4]);
    expect([value(facts, "track.written"), value(facts, "track.waiting"), value(facts, "track.acted")]).toEqual([5, 1, 1]);
    expect(value(facts, "track.search.right")).toBe(2);
    expect(value(facts, "track.changes.grew")).toBe(1);
  });

  test("Page decisions counts every verdict and who decided it", () => {
    const facts = decisionFacts({ pages: 4, creates: [{}], decisions: [
      { verdict: "KEEP", reason: "WORKING" }, { verdict: "MERGE", reason: "COMPETING_MERGE" }, { verdict: "REDIRECT", reason: "SPECIALIST", decidedBy: "AGENT" }, { verdict: "IMPROVE", reason: "REVIEW" },
    ] }, new Set(["COMPETING_MERGE"]));
    expect([value(facts, "decisions.keep"), value(facts, "decisions.merge"), value(facts, "decisions.redirect"), value(facts, "decisions.improve"), value(facts, "decisions.remove")]).toEqual([1, 1, 1, 1, 0]);
    expect([value(facts, "decisions.bySpecialist"), value(facts, "decisions.byCannibalisation"), value(facts, "decisions.creates")]).toEqual([1, 1, 1]);
  });

  test("each is its own specialist's; Page decisions' is written once its pages are decided", () => {
    const now = screensByRole(boxScreensAt(false));
    expect(now.get("INSIGHTS_CONVERSION")).toEqual(["ENQUIRIES", "FUNNEL"]);
    expect(now.get("INSIGHTS_HEAD_OF_STRATEGY")).toEqual(["STRATEGY", "TRACK_RECORD"]);
    expect(boxScreensAt(true)).toEqual(["PAGE_DECISIONS"]);
    expect(fixedRulesFor("INSIGHTS_PAGE_DECISIONS").map((rule) => rule.part)).toContain("boxes");
  });
});
