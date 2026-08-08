import { describe, expect, test } from "vitest";

import { convexHttpActionsUrl } from "./convexHttpActionsUrl";

describe("convexHttpActionsUrl", () => {
  test("derives the actions origin from a stock deployment name", () => {
    expect(
      convexHttpActionsUrl({ NEXT_PUBLIC_CONVEX_URL: "https://shiny-alligator-583.convex.cloud" })
    ).toBe("https://shiny-alligator-583.convex.site");
  });

  /**
   * The reason this module exists. Our two custom domains share no stem, so
   * there is nothing in the API origin to rewrite — the old swap returned it
   * unchanged and pointed webhooks at the origin that does not route them.
   */
  test("does not guess an actions origin from a custom API domain", () => {
    expect(
      convexHttpActionsUrl({ NEXT_PUBLIC_CONVEX_URL: "https://sonae-db.ronins.co.uk" })
    ).toBeNull();
  });

  test("prefers the configured actions origin over any derivation", () => {
    expect(
      convexHttpActionsUrl({
        NEXT_PUBLIC_CONVEX_SITE_URL: "https://sonae-auth.ronins.co.uk",
        NEXT_PUBLIC_CONVEX_URL: "https://shiny-alligator-583.convex.cloud",
      })
    ).toBe("https://sonae-auth.ronins.co.uk");
  });

  test("trims a trailing slash so callers can append a path", () => {
    expect(
      convexHttpActionsUrl({ NEXT_PUBLIC_CONVEX_SITE_URL: "https://sonae-auth.ronins.co.uk/" })
    ).toBe("https://sonae-auth.ronins.co.uk");
  });

  test("returns null when nothing is configured", () => {
    expect(convexHttpActionsUrl({})).toBeNull();
    expect(convexHttpActionsUrl({ NEXT_PUBLIC_CONVEX_SITE_URL: "   " })).toBeNull();
  });
});
