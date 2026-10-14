import { describe, expect, test } from "vitest";
import { expectAnalyticsWords } from "@/src/test/analyticsSeenWords";
import { visitorsSees, type VisitorFacts } from "./analyticsVisitors";

/**
 * What Hakken sees on Visitors (google-analytics-plan.md §18.7): the box
 * worked out from Ronins' figures as board 15 reads them, with words in
 * English and Italian for every code.
 */

const ronins: VisitorFacts = {
  people: 671, visits: 808, engaged: 418, newPeople: 589,
  newVisitors: { visits: 700, conversions: 7 }, returning: { visits: 108, conversions: 5 },
  browsers: [{ label: "Chrome", visits: 498, engaged: 261 }, { label: "Safari", visits: 203, engaged: 90 }, { label: "Edge", visits: 61, engaged: 34 }],
  signals: "off", thresholded: false,
};

describe("15 · Visitors", () => {
  test("people and the share new; returning visitors converting more; a browser engaging less; then what to do", () => {
    const box = visitorsSees(ronins);
    expect(box).toEqual({
      says: [
        { code: "people", a: 671, b: 808, c: 589 / 671 },
        { code: "returnersConvert", a: 108, b: 5 / 108, c: 7 / 700 },
        { code: "browserLags", text: "Safari", a: 203 / 808, b: 90 / 203, c: 418 / 808 },
      ],
      steps: [
        { code: "reasonToReturn", link: "conversions", to: { segment: "conversions" } },
        // Events are part of Conversions (ga-conversions-visitors-plan.md CV1).
        { code: "checkBrowser", text: "Safari", link: "conversions", to: { segment: "conversions" } },
      ],
    });
    expectAnalyticsWords("visitors", box);
  });

  test("where returning visitors land, when enough came back and most landed on one kind of page (CV7)", () => {
    const facts = { ...ronins, signals: "on" as const, browsers: [], newVisitors: { visits: 700, conversions: 7 }, returning: { visits: 108, conversions: 0 } };
    const box = visitorsSees({ ...facts, returningLands: { kind: "brand", share: 0.43, visits: 108 } });
    expect(box.says).toEqual([{ code: "people", a: 671, b: 808, c: 589 / 671 }, { code: "returningLand", text: "brand", a: 0.43 }]);
    // Too few back, or spread across kinds of page: not said.
    expect(visitorsSees({ ...facts, returningLands: { kind: "brand", share: 0.43, visits: 20 } }).says.map((one) => one.code)).toEqual(["people"]);
    expect(visitorsSees({ ...facts, returningLands: { kind: "brand", share: 0.3, visits: 108 } }).says.map((one) => one.code)).toEqual(["people"]);
    expectAnalyticsWords("visitors", box);
  });

  test("Google signals off and groups held back are said; too few returning visits are not weighed; none at all", () => {
    const quiet = visitorsSees({ ...ronins, returning: { visits: 20, conversions: 5 }, browsers: [], thresholded: true });
    expect(quiet.says).toEqual([{ code: "people", a: 671, b: 808, c: 589 / 671 }, { code: "signalsOff" }, { code: "hidden" }]);
    expect(quiet.steps).toEqual([]);
    const none = visitorsSees({ ...ronins, visits: 0 });
    expect(none).toEqual({ says: [{ code: "none" }], steps: [] });
    for (const shown of [quiet, none]) expectAnalyticsWords("visitors", shown);
  });
});
