import { describe, expect, test } from "vitest";
import { bandOf, clickRatesOf, heroesOf, heroPagesOf, problemsOf, rateFor, websiteRatesOf, type HeroPageInput, type WebsiteRates } from "./heroes";

/**
 * A landing page's rules from Google to money
 * (docs/plans/active/google-analytics-plan.md §13), on Ronins' own figures
 * for the 30 days to 9 October 2026: 826 visits, 12 conversions, £240 —
 * 1.45% converting at £20 each.
 */

const RONINS = { visits: 826, engaged: 438, conversions: 12, value: 24_000 };

const rates = (overrides: Partial<WebsiteRates> = {}): WebsiteRates => ({
  ...websiteRatesOf(RONINS, [], 24_000),
  clickRates: { top3: 0.007, "4to5": 0.004, "6to10": 0.002, "11to20": 0.0005, "21plus": 0.0002 },
  ...overrides,
});

const page = (path: string, parts: Partial<HeroPageInput>): HeroPageInput => ({
  page: path, google: null, googleBefore: null, visits: null, visitsBefore: null, ...parts,
});

const visits = (count: number, conversions = 0, value = conversions * 2_000, engaged = Math.round(count / 2)) => ({ visits: count, engaged, conversions, value });

describe("the website's own rates", () => {
  test("its conversion rate, value per conversion and engaged share come from every visit", () => {
    const own = websiteRatesOf(RONINS, [], 24_000);
    expect(own.conversionRate).toBeCloseTo(12 / 826);
    expect(own.valuePerConversion).toBe(2_000);
    expect(own.engagedShare).toBeCloseTo(438 / 826);
    expect(own.conversionsPerEngaged).toBeCloseTo(12 / 438);
  });

  test("its click rate is read for each band of positions from its own searches", () => {
    const bands = clickRatesOf([
      { impressions: 1_000, clicks: 10, position: 2.4 },
      { impressions: 3_000, clicks: 15, position: 3.2 },
      { impressions: 10_000, clicks: 5, position: 14.8 },
    ]);
    expect(bands.top3).toBeCloseTo(25 / 4_000);
    expect(bands["11to20"]).toBeCloseTo(5 / 10_000);
    expect(bands["4to5"]).toBeNull();
    expect([bandOf(0.6), bandOf(3.4), bandOf(3.6), bandOf(20.4), bandOf(20.6)]).toEqual(["top3", "top3", "4to5", "11to20", "21plus"]);
  });

  test("a fix is priced at the page's own rate from 100 visits, otherwise the website's", () => {
    expect(rateFor(page("/", { visits: visits(141, 4) }), rates())).toBeCloseTo(4 / 141);
    expect(rateFor(page("/", { visits: visits(84, 3) }), rates())).toBeCloseTo(12 / 826);
  });
});

describe("each problem, by its rule", () => {
  test("Push to page one: at position 8 to 20, shown 500 times or more, worth the top three's extra clicks", () => {
    // /ai-consultancy/: shown 19,714 times at position 19.4 for 5 clicks.
    const [push] = problemsOf(page("/ai-consultancy/", { google: { shown: 19_714, clicks: 5, position: 19.4 }, visits: visits(5) }), rates());
    expect(push.kind).toBe("push");
    expect(push.gain).toBeCloseTo(19_714 * (0.007 - 0.0005));
    expect(push.worth).toBeCloseTo(19_714 * (0.007 - 0.0005) * (12 / 826) * 2_000);
    expect(problemsOf(page("/x/", { google: { shown: 499, clicks: 0, position: 12 } }), rates())).toEqual([]);
    expect(problemsOf(page("/x/", { google: { shown: 5_000, clicks: 0, position: 7.4 } }), rates()).map((one) => one.kind)).not.toContain("push");
    expect(problemsOf(page("/x/", { google: { shown: 5_000, clicks: 0, position: 20.6 } }), rates())).toEqual([]);
  });

  test("Losing the click: in the top five and clicked under the website's rate there, worth the clicks it should get", () => {
    // /sitefinity-agency/: shown 695 times at position 3.7, never clicked.
    const [click] = problemsOf(page("/sitefinity-agency/", { google: { shown: 695, clicks: 0, position: 3.7 } }), rates());
    expect(click).toMatchObject({ kind: "click", expected: 695 * 0.004 });
    expect(click.worth).toBeCloseTo(695 * 0.004 * (12 / 826) * 2_000);
    expect(problemsOf(page("/x/", { google: { shown: 695, clicks: 10, position: 3.7 } }), rates())).toEqual([]);
    // Shown under 100 times, its click rate is too few to trust.
    expect(problemsOf(page("/x/", { google: { shown: 99, clicks: 0, position: 2 } }), rates())).toEqual([]);
  });

  test("Not converting: 50 visits or more, under half the website's rate, worth the conversions missed", () => {
    // The Kapferer guide: 188 visits, no conversion — about £54.60 a month.
    const [convert] = problemsOf(page("/hub/kapferer-brand-identity-prism/", { visits: visits(188, 0, 0, 81) }), rates());
    expect(convert.kind).toBe("convert");
    expect(convert.worth! / 100).toBeCloseTo(54.62, 1);
    expect(problemsOf(page("/x/", { visits: visits(49) }), rates())).toEqual([]);
  });

  test("People leave: 30 visits or more, under 40% engaged, worth the engaged visits it would keep", () => {
    const [leave] = problemsOf(page("/x/", { visits: visits(60, 2, 4_000, 12) }), rates());
    expect(leave.kind).toBe("leave");
    expect(leave.gain).toBeCloseTo(60 * (438 / 826 - 0.2));
    expect(leave.worth).toBeCloseTo(60 * (438 / 826 - 0.2) * (12 / 438) * 2_000);
    expect(problemsOf(page("/x/", { visits: visits(29, 1, 2_000, 2) }), rates())).toEqual([]);
  });

  test("Falling: visits down 30% or more from at least 20, worth the visits lost", () => {
    // /hub/what-makes-a-good-app: 30 visits the month before, 6 now — about £7.
    const [fall] = problemsOf(page("/hub/what-makes-a-good-app", { visits: visits(6, 0, 0, 4), visitsBefore: visits(30) }), rates());
    expect(fall).toMatchObject({ kind: "fall", gain: 24 });
    expect(fall.worth! / 100).toBeCloseTo(6.97, 1);
    expect(problemsOf(page("/x/", { visits: visits(14), visitsBefore: visits(19) }), rates())).toEqual([]);
    expect(problemsOf(page("/x/", { visits: visits(15), visitsBefore: visits(20) }), rates()).map((one) => one.kind)).toEqual([]);
    expect(problemsOf(page("/x/", { visits: visits(14), visitsBefore: visits(20) }), rates()).map((one) => one.kind)).toEqual(["fall"]);
  });

  test("a page's problems come worth most first; one that cannot be priced comes last", () => {
    const both = problemsOf(page("/x/", { google: { shown: 20_000, clicks: 1, position: 12 }, visits: visits(60, 0, 0, 10) }), rates());
    expect(both.map((one) => one.kind)).toEqual(["push", "convert", "leave"]);
    const unpriced = problemsOf(page("/x/", { visits: visits(200, 0, 0) }), rates({ valuePerConversion: null }));
    expect(unpriced).toMatchObject([{ kind: "convert", worth: null }]);
  });
});

describe("heroes, and each page's problems", () => {
  // Ronins' pages that made money: the home page £80, /ai-agency/ £60, the author page £40, two at £20.
  const pages = [
    page("/", { visits: visits(141, 4, 8_000) }),
    page("/ai-agency/", { visits: visits(84, 3, 6_000), google: { shown: 13_818, clicks: 71, position: 14 } }),
    page("/author/anthony/", { visits: visits(4, 2, 4_000) }),
    page("/venture-studio/", { visits: visits(12, 1, 2_000) }),
    page("/hub/how-to-design-an-app/", { visits: visits(2, 1, 2_000) }),
    page("/hub/kapferer-brand-identity-prism/", { visits: visits(188, 0, 0, 81) }),
    page("/quiet/", { visits: visits(3) }),
  ];

  test("the heroes are the pages that, biggest first, make 80% of the value: four make £200 of £240", () => {
    expect([...heroPagesOf(pages, 24_000)]).toEqual(["/", "/ai-agency/", "/author/anthony/", "/venture-studio/"]);
    expect(heroPagesOf(pages, 0).size).toBe(0);
  });

  test("each page carries whether it is a hero and its problems, worth most first", () => {
    const shown = heroesOf(pages, rates());
    const of = (path: string) => shown.find((one) => one.page === path)!;
    expect(of("/")).toMatchObject({ hero: true, problems: [] });
    expect(of("/ai-agency/").hero).toBe(true);
    expect(of("/ai-agency/").problems.map((one) => one.kind)).toEqual(["push"]);
    expect(of("/hub/kapferer-brand-identity-prism/").hero).toBe(false);
    expect(of("/hub/kapferer-brand-identity-prism/").problems.map((one) => one.kind)).toEqual(["convert"]);
    expect(of("/quiet/")).toMatchObject({ hero: false, problems: [] });
  });
});
