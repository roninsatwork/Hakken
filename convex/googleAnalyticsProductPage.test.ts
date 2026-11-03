import { describe, expect, test } from "vitest";
import { bestPageFor } from "./googleAnalyticsProductReads";

/**
 * The page a product is sold on (products-screen-4-plan-2026-11-02.md; Anthony, 2026-11-02: "click through and click
 * back"): the page viewed whose address is most nearly the product's own name, its sizes and finishes sharing one
 * page; none when no address is near enough. Addresses as MoreHandles' are written.
 */

const pages = [
  { key: "~1", address: "https://www.morehandles.co.uk/alexander-and-wilks-waltz-round-cupboard-knob-on-stepped-rose.html", views: 900 },
  { key: "~2", address: "https://www.morehandles.co.uk/alexander-and-wilks-waltz-round-cupboard-knob.html", views: 1200 },
  { key: "~3", address: "https://www.morehandles.co.uk/cupboard-knobs.html", views: 5000 },
  { key: "~4", address: "https://www.morehandles.co.uk/zoo-hardware-top-drawer-fittings-round-cupboard-knob.html", views: 8 },
  { key: "~5", address: "https://www.morehandles.co.uk/", views: 20000 },
];

describe("a product's own page", () => {
  test("the address most nearly its name, whatever its size or finish", () => {
    expect(bestPageFor("Alexander and Wilks - Waltz Round Cupboard Knob on Stepped Rose - Antique Brass - 32mm", pages)).toBe("~1");
    expect(bestPageFor("Alexander and Wilks - Waltz Round Cupboard Knob on Stepped Rose - Satin Brass - 38mm", pages)).toBe("~1");
    expect(bestPageFor("Zoo Hardware Top Drawer Fittings Round Cupboard Knob – Polished Brass", pages)).toBe("~4");
  });

  test("no page near enough: a category page, the home page or another product never stand in", () => {
    expect(bestPageFor("Eurospec Grade 11 Ball Bearing Hinge – Pair-Antique Brass-Square", pages)).toBeNull();
    expect(bestPageFor("Cupboard Knob", pages)).toBeNull();
    expect(bestPageFor("Anything", [])).toBeNull();
  });
});
