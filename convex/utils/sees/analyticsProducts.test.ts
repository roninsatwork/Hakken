import { describe, expect, test } from "vitest";
import { expectAnalyticsWords } from "@/src/test/analyticsSeenWords";
import { leftWithout, productsSees, type Journey } from "./analyticsProducts";

/**
 * What Hakken sees on Products (products-screen-4-plan-2026-11-02.md, phase 4): the box worked out from the shop's
 * chosen steps and its items, never money, with words in English and Italian for every code.
 */

const sample = [
  { name: "Brass lever handle on rose", itemsBought: 22, itemsAdded: 40, itemsLeft: 18 },
  { name: "Black T-bar pull", itemsBought: 2, itemsAdded: 60, itemsLeft: 58 },
  { name: "Floor door stop", itemsBought: 0, itemsAdded: 0, itemsLeft: 0 },
];

const figure = (eventName: string, visits: number, visitsBefore: number | null = null) => ({ eventName, visits, visitsBefore });

describe("25 · Products", () => {
  test("Google's own steps: baskets and checkouts left; half the checkouts unfinished; a product added often and rarely bought", () => {
    const journey: Journey = { steps: [figure("add_to_cart", 612), figure("begin_checkout", 241)], sale: figure("purchase", 118) };
    const box = productsSees(journey, sample);
    expect(box).toEqual({
      says: [
        { code: "basketsLeftAlone", a: 1 - 118 / 612, c: 612, text: "add_to_cart" },
        { code: "checkoutsLeftAlone", a: 1 - 118 / 241, c: 241, text: "begin_checkout" },
        { code: "mostLeft", text: "Black T-bar pull", a: 60, b: 2 },
      ],
      steps: [
        { code: "seeProduct", text: "Black T-bar pull", link: "allPages", to: { segment: "all-pages", filters: { q: "Black T-bar pull" } } },
        { code: "whyUnfinished", link: "checkoutEvent", to: { segment: "events/event", filters: { key: "begin_checkout" } } },
      ],
    });
    expectAnalyticsWords("products", box);
  });

  test("against the period before; a shop's own step names; most checkouts finished; nothing sold at all", () => {
    const journey: Journey = { steps: [figure("add-to-cart", 120, 100), figure("begin_checkout", 40, 40)], sale: figure("checkout_complete", 30, 20) };
    const box = productsSees(journey, [sample[0]]);
    expect(box.says).toEqual([
      { code: "stepLeft", a: 1 - 30 / 120, b: 1 - 20 / 100, c: 120, text: "add-to-cart" },
      { code: "checkoutsLeft", a: 1 - 30 / 40, b: 1 - 20 / 40, c: 40, text: "begin_checkout" },
      { code: "bestSeller", text: "Brass lever handle on rose", a: 22 },
    ]);
    expect(box.steps).toEqual([]);
    const none = productsSees({ steps: [figure("add_to_cart", 0)], sale: figure("purchase", 0) }, []);
    expect(none).toEqual({ says: [{ code: "none" }], steps: [] });
    for (const shown of [box, none]) expectAnalyticsWords("products", shown);
  });

  test("no sale picked: nothing is said about steps, only the products", () => {
    const box = productsSees({ steps: [figure("add_to_cart", 500)], sale: null }, sample);
    expect(box.says.map((phrase) => phrase.code)).toEqual(["mostLeft", "bestSeller"]);
    expect(box.steps.map((step) => step.code)).toEqual(["seeProduct"]);
    expectAnalyticsWords("products", box);
  });

  test("a step left by none who reached it is nought; one no visit reached has no share", () => {
    expect([leftWithout(5_108, 1_246), leftWithout(10, 10), leftWithout(0, 0)]).toEqual([1 - 1_246 / 5_108, 0, null]);
  });
});
