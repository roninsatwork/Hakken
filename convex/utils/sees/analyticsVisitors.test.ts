import { describe, expect, test } from "vitest";
import { expectAnalyticsWords } from "@/src/test/analyticsSeenWords";
import { visitorsSees, type VisitorFacts } from "./analyticsVisitors";

/**
 * What Hakken sees on Visits (visits-redo-plan-2026-11-03.md, step 2; before that Visitors, google-analytics-plan.md
 * §18.7): the box worked out from Ronins' figures, every one in visits, with words in English and Italian for every code.
 */

const ronins: VisitorFacts = {
  visits: 808, newVisits: 700, engaged: 418,
  browsers: [{ label: "Chrome", visits: 498, engaged: 261 }, { label: "Safari", visits: 203, engaged: 90 }, { label: "Edge", visits: 61, engaged: 34 }],
  signals: "off", thresholded: false,
};

describe("15 · Visits", () => {
  test("the visits and the share from new visitors; a browser engaging less; then what to do", () => {
    const box = visitorsSees(ronins);
    expect(box).toEqual({
      says: [
        { code: "visits", a: 808, b: 700 / 808 },
        { code: "browserLags", text: "Safari", a: 203 / 808, b: 90 / 203, c: 418 / 808 },
        { code: "signalsOff" },
      ],
      steps: [
        // Events are part of Conversions (ga-conversions-visitors-plan.md CV1).
        { code: "checkBrowser", text: "Safari", link: "conversions", to: { segment: "conversions" } },
      ],
    });
    expectAnalyticsWords("visitors", box);
  });

  test("no rule weighs new against returning visitors' conversions: the lists count every conversion, not visits", () => {
    const codes = visitorsSees(ronins).says.map((one) => one.code);
    expect(codes).not.toContain("returnersConvert");
    expect(visitorsSees(ronins).steps.map((one) => one.code)).not.toContain("reasonToReturn");
  });

  test("where returning visitors land, when enough came back and most landed on one kind of page (CV7)", () => {
    const facts = { ...ronins, signals: "on" as const, browsers: [] };
    const box = visitorsSees({ ...facts, returningLands: { kind: "Brand", share: 0.43, visits: 108 } });
    expect(box.says).toEqual([{ code: "visits", a: 808, b: 700 / 808 }, { code: "returningLand", text: "Brand", a: 0.43 }]);
    // Too few back, or spread across kinds of page: not said.
    expect(visitorsSees({ ...facts, returningLands: { kind: "Brand", share: 0.43, visits: 20 } }).says.map((one) => one.code)).toEqual(["visits"]);
    expect(visitorsSees({ ...facts, returningLands: { kind: "Brand", share: 0.3, visits: 108 } }).says.map((one) => one.code)).toEqual(["visits"]);
    expectAnalyticsWords("visitors", box);
  });

  test("Google signals off and groups held back are said; none at all", () => {
    const quiet = visitorsSees({ ...ronins, browsers: [], thresholded: true });
    expect(quiet.says).toEqual([{ code: "visits", a: 808, b: 700 / 808 }, { code: "signalsOff" }, { code: "hidden" }]);
    expect(quiet.steps).toEqual([]);
    const none = visitorsSees({ ...ronins, visits: 0 });
    expect(none).toEqual({ says: [{ code: "none" }], steps: [] });
    for (const shown of [quiet, none]) expectAnalyticsWords("visitors", shown);
  });
});
