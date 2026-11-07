import { describe, expect, test } from "vitest";
import { SEES_SCREENS, seesScreenFor, seesWrites } from "@/convex/utils/sees/screens";
import { neverWordsOf } from "./eyeHolds";

/**
 * The words a page's `never` list forbids its findings (`expectEyeHolds`, eye-code-first-brief-plan-2026-11-07.md, "What each
 * page never says"), held here so the check can't quietly stop catching anything: a topic reworded so it no longer reads as a
 * list of words would leave its page unchecked.
 */
const wordsOn = (screen: string) => neverWordsOf(seesScreenFor(screen)?.never ?? []).map(({ word }) => word).sort();

describe("what each page never says, as words its findings are held to", () => {
  test("Services: never money, conversions or a group called busy or quiet", () => {
    expect(wordsOn("googleAnalytics.services")).toEqual(expect.arrayContaining(["money", "conversions", "enquiries", "sales", "bought", "baskets", "busy", "quiet", "working"]));
  });

  test("Google Analytics: never money", () => {
    for (const screen of ["googleAnalytics.overview", "googleAnalytics.products", "googleAnalytics.allPages", "googleAnalytics.channelsPage"]) expect(wordsOn(screen), screen).toContain("money");
  });

  test("Bing and Search Console: never money, visits, conversions or enquiries", () => {
    for (const screen of ["bing.performance", "bing.keywords", "searchConsole.performance"]) {
      expect(wordsOn(screen), screen).toEqual(expect.arrayContaining(["money", "visits", "conversions", "enquiries"]));
    }
  });

  test("Bing's Crawling: never clicks, times shown or places", () => {
    expect(wordsOn("bing.crawling")).toEqual(expect.arrayContaining(["clicks", "times shown", "places"]));
  });

  test("Clarity: never conversions, enquiries, sales or money", () => {
    expect(wordsOn("clarity.overview")).toEqual(expect.arrayContaining(["conversions", "enquiries", "sales", "money"]));
  });

  test("a topic about how a thing is said is no list of words", () => {
    expect(neverWordsOf(["enquiries as people: they count the conversions the website counts", "a day-by-day story: the figures come from checks on set days"])).toEqual([]);
  });

  test("the words catch what they stand for, and let the app's own names through", () => {
    const [money] = neverWordsOf(["money: what anything earned or cost"]);
    expect(money.pattern.test("£1,200 from this page")).toBe(true);
    expect(money.pattern.test("its revenue fell")).toBe(true);
    expect(money.pattern.test("Money pages in Google's index but not Bing's")).toBe(false);
  });

  test("every page whose eye writes and never talks about money is held to it", () => {
    const unheld = Object.keys(SEES_SCREENS).filter((screen) => seesWrites(screen) && (seesScreenFor(screen)?.never ?? []).some((entry) => entry.toLowerCase().startsWith("money")) && !wordsOn(screen).includes("money"));
    expect(unheld).toEqual([]);
  });
});
