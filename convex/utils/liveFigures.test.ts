import { describe, expect, test } from "vitest";
import { LEAST_USUAL_FOR_A_VERDICT, liveKinds, liveVerdict, usualNow, type LivePage } from "./liveFigures";
import { isShopTitle } from "./shopPages";

const page = (title: string, kind: string, kindName: string | null = null): LivePage => ({ title, address: `/${title}`, kind, kindName });

describe("Live's figures, one way for the screen, the eye and Ask Hakken", () => {
  test("Google's pages add up by Classification, most first, every view counted once", () => {
    const rows = [{ name: "A", views: 3 }, { name: "B", views: 10 }, { name: "C", views: 4 }, { name: "Not saved", views: 2 }, { name: "No views", views: 0 }];
    const pages = [page("A", "locks", "Locks"), page("B", "handles", "Handles"), page("C", "locks", "Locks"), page("No views", "locks", "Locks")];
    expect(liveKinds(rows, pages)).toEqual([
      { kind: "handles", name: "Handles", views: 10, pages: 1 },
      { kind: "locks", name: "Locks", views: 7, pages: 2 },
      { kind: "NOT_SORTED", name: null, views: 2, pages: 1 },
    ]);
  });

  test("usual is this time of the week where the hours are kept, and last month's even spread where they aren't", () => {
    expect(usualNow({ people: 20, views: 100, conversions: 18, peopleThisTime: 41, viewsThisTime: 150, conversionsThisTime: 23 }))
      .toEqual({ people: 41, peopleThisTime: true, views: 150, viewsThisTime: true, conversions: 23, conversionsThisTime: true });
    expect(usualNow({ people: 20, views: 100, conversions: 18, peopleThisTime: null, viewsThisTime: null, conversionsThisTime: null }))
      .toEqual({ people: 20, peopleThisTime: false, views: 100, viewsThisTime: false, conversions: 18, conversionsThisTime: false });
    // None at this hour is a real answer once the hours are saved: a quiet hour's usual is none, not last month's average.
    expect(usualNow({ people: 20, views: 100, conversions: 18, peopleThisTime: 0 }).people).toBe(0);
  });

  test("the verdict says more or fewer on each, as the figures are", () => {
    const usual = { people: 20, views: 100, conversions: 18, conversionsThisTime: 23 };
    expect(liveVerdict({ people: 26, conversions: 15 }, usual)).toEqual({ people: "more", conversions: "fewer" });
    expect(liveVerdict({ people: 26, conversions: 30 }, usual)).toEqual({ people: "more", conversions: "more" });
    expect(liveVerdict({ people: 10, conversions: 15 }, usual)).toEqual({ people: "fewer", conversions: "fewer" });
    expect(liveVerdict({ people: 10, conversions: 30 }, usual)).toEqual({ people: "fewer", conversions: "more" });
  });

  test("no verdict on a usual too small to trust: one person would swing it", () => {
    expect(liveVerdict({ people: 3, conversions: 1 }, { people: LEAST_USUAL_FOR_A_VERDICT - 0.1, views: 2, conversions: 0.1 })).toBeNull();
    // People big enough, conversions too few: people alone.
    expect(liveVerdict({ people: 30, conversions: 1 }, { people: 20, views: 100, conversions: 0.5 })).toEqual({ people: "more", conversions: null });
    // A website counting no conversions: people alone.
    expect(liveVerdict({ people: 30, conversions: null }, { people: 20, views: 100, conversions: 0 })).toEqual({ people: "more", conversions: null });
  });

  test("a shop's working pages are known by their titles, and another page isn't", () => {
    for (const title of ["Search results for: 'brass knob'", "Shopping Basket", "Checkout", "Customer Login", "My Account", "Order # 100123", "Success Page", "Your Shopping Cart"]) expect(isShopTitle(title), title).toBe(true);
    for (const title of ["More Handles | Handles, Knobs", "Antique Brass Basket Handles", "How to search for a lock"]) expect(isShopTitle(title), title).toBe(false);
  });
});
