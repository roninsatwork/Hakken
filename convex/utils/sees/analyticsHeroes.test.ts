import { describe, expect, test } from "vitest";
import { expectAnalyticsWords } from "@/src/test/analyticsSeenWords";
import { landingPageSees } from "./analyticsHeroes";

/**
 * What Hakken sees on a landing page's own screen
 * (docs/plans/active/google-analytics-plan.md §13, §14): what each rule says
 * first, and that every sentence and step has its words in English and Italian.
 */

const visits = (count: number, conversions = 0, engaged = Math.round(count / 2)) => ({ visits: count, engaged, conversions, value: conversions * 2_000 });

describe("a landing page's own box", () => {
  const journey = {
    page: "/",
    consoleAddress: "https://www.ronins.co.uk/",
    google: { shown: 4_231, clicks: 13, position: 30.2 },
    visits: visits(141, 4),
    visitsBefore: visits(115, 7),
    hero: true,
    problems: [] as Array<{ kind: "convert"; worth: number; gain: number }>,
    website: { value: 24_000 },
  };

  test("what it makes, where its conversions came from, where it sits in Google, how its conversions moved", () => {
    const box = landingPageSees(journey, [{ label: "Direct", visits: 75, conversions: 3 }, { label: "Organic Search", visits: 37, conversions: 0 }], { console: "/app/search-console/x/pages/page?key=y", page: "https://www.ronins.co.uk/" });
    expect(box.says.map((phrase) => phrase.code)).toEqual(["makes", "noneFromGoogle", "inGoogle"]);
    expect(box.steps.map((step) => step.code)).toEqual(["whatChanged", "hero"]);
    // A hero's step opens Landing pages, where the website's other pages are.
    expect(box.steps[1]).toEqual({ code: "hero", link: "landingPages", to: { segment: "funnel" } });
    expectAnalyticsWords("landingPage", box);
  });

  test("a page with a problem leads with its fix, linked where it is done", () => {
    const box = landingPageSees({ ...journey, hero: false, visits: visits(188, 0, 81), visitsBefore: null, problems: [{ kind: "convert", worth: 5_460, gain: 2.7 }] }, null, { console: null, page: "https://www.ronins.co.uk/guide/" });
    expect(box.says.map((phrase) => phrase.code)).toEqual(["makesNothing", "inGoogle"]);
    expect(box.steps[0]).toMatchObject({ code: "fixConvert", a: 5_460, to: { url: "https://www.ronins.co.uk/guide/" } });
    expectAnalyticsWords("landingPage", box);
  });
});
