import { describe, expect, test } from "vitest";
import { expectAnalyticsWords } from "@/src/test/analyticsSeenWords";
import { leftWithout, productsSees } from "./analyticsProducts";

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
  test("by shoppers: looks to baskets, the baskets and checkouts left; half the checkouts unfinished; a product rarely bought", () => {
    const box = productsSees({ looked: 4_210, basket: 612, checkout: 241, bought: 118 }, sample);
    // Three sentences at most: the baskets and checkouts left come before the product looked at and rarely bought,
    // which keeps its step (as drawn and approved, 2026-10-21).
    expect(box).toEqual({
      says: [
        { code: "looksToBasket", a: 4_210, b: 612, c: 612 / 4_210 },
        { code: "basketsLeftAlone", a: 1 - 118 / 612 },
        { code: "checkoutsLeftAlone", a: 1 - 118 / 241, b: 241 },
      ],
      steps: [
        { code: "seeProduct", text: "Black T-bar pull", link: "allPages", to: { segment: "all-pages", filters: { q: "Black T-bar pull" } } },
        { code: "whyUnfinished", link: "checkoutEvent", to: { segment: "events/event", filters: { key: "begin_checkout" } } },
      ],
    });
    expectAnalyticsWords("products", box);
  });

  test("against the span before; most checkouts finished; nothing sold at all", () => {
    const box = productsSees({ looked: 900, basket: 120, checkout: 40, bought: 30 }, [sample[0]], { looked: 800, basket: 100, checkout: 40, bought: 20 });
    expect(box.says).toEqual([
      { code: "looksToBasket", a: 900, b: 120, c: 120 / 900 },
      { code: "basketsLeft", a: 1 - 30 / 120, b: 1 - 20 / 100 },
      { code: "checkoutsLeft", a: 1 - 30 / 40, b: 1 - 20 / 40, c: 40 },
    ]);
    expect(box.steps).toEqual([]);
    const none = productsSees({ looked: 0, basket: 0, checkout: 0, bought: 0 }, []);
    expect(none).toEqual({ says: [{ code: "none" }], steps: [] });
    for (const shown of [box, none]) expectAnalyticsWords("products", shown);
  });

  test("nothing in a basket: no share left, and the product rarely bought and the best seller are said", () => {
    const box = productsSees({ looked: 500, basket: 0, checkout: 0, bought: 0 }, sample);
    expect(box.says).toEqual([
      { code: "looksToBasket", a: 500, b: 0, c: 0 },
      { code: "stuck", text: "Black T-bar pull", a: 380, b: 2 },
      { code: "bestSeller", text: "Brass lever handle on rose", a: 286_000 },
    ]);
    expectAnalyticsWords("products", box);
  });

  test("a step left by none who reached it is nought; one no visit reached has no share", () => {
    expect([leftWithout(5_108, 1_246), leftWithout(10, 10), leftWithout(0, 0)]).toEqual([1 - 1_246 / 5_108, 0, null]);
  });
});
