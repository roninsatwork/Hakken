import { describe, expect, test } from "vitest";
import { expectAnalyticsWords } from "@/src/test/analyticsSeenWords";
import { heroesOf, websiteRatesOf, type HeroPageInput } from "../heroes";
import { heroesSees, landingPageSees } from "./analyticsHeroes";

/**
 * What Hakken sees on Heroes and attention and on a landing page's own screen
 * (docs/plans/active/google-analytics-plan.md §13, §14): what each rule says
 * first, and that every sentence and step has its words in English and Italian.
 */

const visits = (count: number, conversions = 0, engaged = Math.round(count / 2)) => ({ visits: count, engaged, conversions, value: conversions * 2_000 });
const page = (path: string, parts: Partial<HeroPageInput>): HeroPageInput => ({ page: path, google: null, googleBefore: null, visits: null, visitsBefore: null, ...parts });

const RATES = {
  ...websiteRatesOf({ visits: 826, engaged: 438, conversions: 12, value: 24_000 }, [], 24_000),
  clickRates: { top3: 0.007, "4to5": 0.004, "6to10": 0.002, "11to20": 0.0005, "21plus": 0.0002 },
};

const PAGES = heroesOf([
  page("/", { visits: visits(141, 4) }),
  page("/ai-agency/", { visits: visits(84, 3), google: { shown: 13_383, clicks: 62, position: 13.9 } }),
  page("/ai-consultancy/", { visits: visits(5), google: { shown: 18_951, clicks: 5, position: 19.2 } }),
  page("/sitefinity-agency/", { google: { shown: 683, clicks: 0, position: 3.7 } }),
  page("/hub/kapferer-brand-identity-prism/", { visits: visits(188, 0, 81) }),
  page("/hub/what-makes-a-good-app/", { visits: visits(6, 0, 4), visitsBefore: visits(30) }),
], RATES);

const linkOf = (path: string) => ({ key: path });

describe("Heroes and attention's box", () => {
  test("most to gain in Google's results: the showings that are not clicked, the heroes, then the first fixes", () => {
    const box = heroesSees({
      stages: { shown: 264_403, clickRate: 0.0014, websiteValue: 24_000, heroes: 2, heroesValue: 14_000, gainInGoogle: 5_000, gainOnPages: 1_000 },
      totalGain: 6_000, pages: PAGES, consoleConnected: true, linkOf,
    });
    expect(box.says.map((phrase) => phrase.code)).toEqual(["mostInGoogle", "heroes"]);
    expect(box.steps.map((step) => step.code)).toEqual(["pushTwo", "rewrite", "nextStep"]);
    expect(box.steps[2]).toMatchObject({ text: "/hub/kapferer-brand-identity-prism/", a: 188, b: 0, to: { segment: "heroes/page", filters: { key: "/hub/kapferer-brand-identity-prism/" } } });
    expectAnalyticsWords("heroes", box);
  });

  test("most on the pages, without Search Console, and nothing to gain", () => {
    const onPages = heroesSees({
      stages: { shown: null, clickRate: null, websiteValue: 24_000, heroes: 1, heroesValue: 8_000, gainInGoogle: 0, gainOnPages: 6_000 },
      totalGain: 6_000, pages: PAGES.filter((one) => !one.google), consoleConnected: false, linkOf,
    });
    expect(onPages.says.map((phrase) => phrase.code)).toEqual(["mostOnPages", "heroes", "noConsole"]);
    expectAnalyticsWords("heroes", onPages);
    const none = heroesSees({
      stages: { shown: 1_000, clickRate: 0.01, websiteValue: 0, heroes: 0, heroesValue: 0, gainInGoogle: 0, gainOnPages: 0 },
      totalGain: 0, pages: [], consoleConnected: true, linkOf,
    });
    expect(none.says.map((phrase) => phrase.code)).toEqual(["nothingToGain"]);
    expectAnalyticsWords("heroes", none);
  });
});

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
    expectAnalyticsWords("landingPage", box);
  });

  test("a page with a problem leads with its fix, linked where it is done", () => {
    const box = landingPageSees({ ...journey, hero: false, visits: visits(188, 0, 81), visitsBefore: null, problems: [{ kind: "convert", worth: 5_460, gain: 2.7 }] }, null, { console: null, page: "https://www.ronins.co.uk/guide/" });
    expect(box.says.map((phrase) => phrase.code)).toEqual(["makesNothing", "inGoogle"]);
    expect(box.steps[0]).toMatchObject({ code: "fixConvert", a: 5_460, to: { url: "https://www.ronins.co.uk/guide/" } });
    expectAnalyticsWords("landingPage", box);
  });
});
