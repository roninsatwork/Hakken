import { cleanup, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { useConvex, useQuery } from "convex/react";

import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import { statusWith } from "@/src/test/googleAnalyticsFixtures";
import AnalyticsProductsPage from "./[siteId]/products/page";

const nav = vi.hoisted(() => ({ pathname: "/app/analytics/site_1/products", search: "period=lastMonth", push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

/**
 * A product's row opens the page it is sold on, and that page's Back returns to Products as it was
 * (products-screen-4-plan-2026-11-02.md; Anthony, 2026-11-02: "click through and click back"); a product with no
 * page near enough its name opens All pages searched for it.
 */

const product = { key: "Brass lever handle\u001fHandles", name: "Brass lever handle", category: "Handles", itemsBought: 22, itemsAdded: 88, itemsLeft: 66, itemsBoughtBefore: 18, share: 0.4 };
const event = (eventName: string, visits: number, visitsBefore: number) => ({ eventName, visits, visitsBefore });
const journey = { steps: [event("add_to_cart", 412, 398), event("begin_checkout", 201, 205)], sale: event("purchase", 118, 112) };

function open(page: { key: string } | null) {
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "googleAnalyticsConnect:googleAnalyticsStatus": statusWith({ shop: true }),
    "googleAnalyticsProductReads:analyticsProducts": {
      shop: true, preparing: false, missing: [], events: [...journey.steps, journey.sale],
      choice: { steps: ["add_to_cart", "begin_checkout"], sale: "purchase", saved: false }, journey,
      neverBought: { count: 3, of: 9, countBefore: 4 }, categories: ["Handles"], seen: { says: [], steps: [] },
    },
    "googleAnalyticsProductReads:analyticsProductChart": { left: [], sold: [], more: [], less: [], compared: true },
    "googleAnalyticsProductReads:analyticsProductList": { rows: [product], total: 1, page: 1, pages: 1, size: 25, cut: null, live: false, preparing: false },
  }));
  const query = vi.fn(async (reference: unknown) => (convexPath(reference).endsWith("analyticsProductPage") ? page : null));
  vi.mocked(useConvex).mockReturnValue({ query, mutation: vi.fn(), action: vi.fn() } as never);
  render(<AnalyticsProductsPage />);
  return query;
}

/** The product's row in the table, clicked. */
async function clickRow() {
  const table = await screen.findByRole("table");
  within(table).getByText("Brass lever handle").click();
}

beforeEach(() => {
  // A fixed day, the one after the fixtures' newest: the screens' calendar periods count from today (AGENTS.md).
  useScreenDay("2026-10-09");
  nav.push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Products: a product clicked through to its page, and back", () => {
  it("opens the page it is sold on, with Back to Products as it was", async () => {
    const query = open({ key: "~p9" });
    await clickRow();
    await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
    expect(query).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: "Brass lever handle", period: "lastMonth" }));
    const href = new URL(nav.push.mock.calls[0][0] as string, "http://hakken.localhost");
    expect(href.pathname).toBe("/app/analytics/site_1/all-pages/page");
    expect(href.searchParams.get("key")).toBe("~p9");
    expect(href.searchParams.get("from")).toBe("products?period=lastMonth");
  });

  it("with no page near enough its name, opens All pages searched for it", async () => {
    open(null);
    await clickRow();
    await waitFor(() => expect(nav.push).toHaveBeenCalledTimes(1));
    const href = new URL(nav.push.mock.calls[0][0] as string, "http://hakken.localhost");
    expect(href.pathname).toBe("/app/analytics/site_1/all-pages");
    expect(href.searchParams.get("q")).toBe("Brass lever handle");
  });
});
