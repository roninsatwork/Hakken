import { describe, expect, test } from "vitest";
import { expectAnalyticsWords } from "@/src/test/analyticsSeenWords";
import { productsSees } from "./analyticsProducts";

/**
 * What Hakken sees on Products (google-analytics-plan.md §18.7): the box
 * worked out from board 25's sample shop, with words in English and Italian
 * for every code.
 */

const sample = [
  { name: "Brass lever handle on rose", looks: 612, bought: 22, revenue: 286_000 },
  { name: "Black T-bar pull", looks: 380, bought: 2, revenue: 9_600 },
  { name: "Floor door stop", looks: 90, bought: 0, revenue: 0 },
];

describe("25 · Products", () => {
  test("looks to baskets; half the checkouts unfinished; a product looked at and rarely bought", () => {
    const box = productsSees({ looked: 4_210, basket: 612, checkout: 241, bought: 118 }, sample);
    expect(box).toEqual({
      says: [
        { code: "looksToBasket", a: 4_210, b: 612, c: 612 / 4_210 },
        { code: "fewFinished", a: 118 / 241, b: 241 },
        { code: "stuck", text: "Black T-bar pull", a: 380, b: 2 },
      ],
      steps: [
        { code: "seeProduct", text: "Black T-bar pull", link: "allPages", to: { segment: "all-pages", filters: { q: "Black T-bar pull" } } },
        { code: "whyUnfinished", link: "checkoutEvent", to: { segment: "events/event", filters: { key: "begin_checkout" } } },
      ],
    });
    expectAnalyticsWords("products", box);
  });

  test("most checkouts finished and nothing stuck: the best seller; nothing sold at all", () => {
    const box = productsSees({ looked: 900, basket: 120, checkout: 40, bought: 30 }, [sample[0]]);
    expect(box.says).toEqual([
      { code: "looksToBasket", a: 900, b: 120, c: 120 / 900 },
      { code: "finished", a: 30 / 40, b: 40 },
      { code: "bestSeller", text: "Brass lever handle on rose", a: 286_000 },
    ]);
    expect(box.steps).toEqual([]);
    const none = productsSees({ looked: 0, basket: 0, checkout: 0, bought: 0 }, []);
    expect(none).toEqual({ says: [{ code: "none" }], steps: [] });
    for (const shown of [box, none]) expectAnalyticsWords("products", shown);
  });
});
