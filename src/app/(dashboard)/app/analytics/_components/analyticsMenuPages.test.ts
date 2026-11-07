import { describe, expect, test } from "vitest";
import { ANALYTICS_PAGES } from "./useAnalytics";

/**
 * Every page in the Google Analytics menu shows on every website (Anthony, 7 November 2026: "no page should be hidden from any
 * website", after Services was hidden on shops, a rule he never asked for, and Products on websites that don't sell). A page
 * with nothing to show for a website says why on the page itself. `AnalyticsMenu.tsx` lists every page of each group.
 */
describe("the Google Analytics menu's pages", () => {
  test("no page is kept to some websites", () => {
    expect(ANALYTICS_PAGES.filter((page) => Object.keys(page).some((field) => !["id", "segment", "group"].includes(field)))).toEqual([]);
  });

  test("Products and Services are both in the figures", () => {
    expect(ANALYTICS_PAGES.filter((page) => page.group === "figures").map((page) => page.id)).toEqual(expect.arrayContaining(["products", "services"]));
  });
});
