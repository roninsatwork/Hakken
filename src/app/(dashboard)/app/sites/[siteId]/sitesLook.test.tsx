import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import SiteTrackedFanOutPage from "./google/fan-out/page";
import SiteYourPagesPage from "./your-pages/page";

/**
 * Discovery → Websites' screens hold to the looks Anthony approved
 * (design-drift-plan D4): each screen, rendered with sample rows in English,
 * reads as the outline saved beside its board in
 * docs/plans/assets/search-console-redesign/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "search-console-redesign";

const SITE = { host: "acme-shop.test", placeLabel: "United Kingdom", counts: {} };

/** A tracked search as Your searches reads it. */
function standing(keyword: string, lastPosition: number | null, verdict: string) {
  return {
    keyword, isActive: true, fromFanOut: true, verdict, lastPosition, previousPosition: lastPosition === null ? null : lastPosition + 2, bestPosition: lastPosition,
    firstCheckedDay: "2026-09-20", lastCheckedDay: "2026-09-29",
  };
}

/** Twenty-six tracked fan-out queries: more than a page, so the footer offers its rows per page. */
const QUERIES = Array.from({ length: 26 }, (_, index) => ({
  keyword: `ai consultants london ${index + 1}`,
  queryText: `AI consultants London ${index + 1}`,
  position: index < 24 ? index + 1 : null,
}));

const STANDINGS = QUERIES.map((query) => standing(query.keyword, query.position, query.position === null ? "NEVER_RANKED" : query.position <= 3 ? "TOP_THREE" : query.position <= 10 ? "PAGE_ONE" : "RANKING"));

const FAN_OUT = {
  rows: QUERIES.map((query, index) => ({
    keyword: query.keyword, queryText: query.queryText, prompt: "who are good ai consultants", engines: index % 2 ? ["claude"] : ["chatgpt", "claude"], timesSeen: 2 + (index % 3),
  })),
  own: true,
  tracking: { count: QUERIES.length, limit: 200 },
};

const SUMMARY = {
  pages: 175, sitemap: 139, crawled: 157, shown: 158, ranking: 66,
  neverShown: 6, notInSitemap: 25, crawledNotInSitemap: 19, notCrawled: 1,
  sitemapRead: true, sitemapSource: "ROBOTS", sitemapFiles: 4, sitemapFailed: 0, sitemapCut: false, sitemapLimit: 5_000, sitemapDay: "2026-10-03",
  console: true, consoleFrom: "2026-07-04", consoleTo: "2026-10-01", crawlDay: "2026-09-28", builtAt: 1,
};

const YOUR_PAGES = {
  rows: [
    { page: "/ai-agency/", file: "page-sitemap.xml", crawled: true, shown: true, ranks: true, clicks: 453, group: null, kind: "SERVICE" },
    { page: "/author/anthony/", file: null, crawled: true, shown: true, ranks: false, clicks: 15, group: null, kind: "UNJUDGED" },
  ],
  total: 175, page: 1, pages: 7, size: 25, cut: null, preparing: false,
  own: true, summary: SUMMARY, groupBy: "KIND", groups: [{ value: "SERVICE", label: "SERVICE" }],
};

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation((() => vi.fn(async () => null)) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

function at(path: string, search = "") {
  nav.pathname = path;
  nav.search = search;
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Discovery → Websites' approved looks", () => {
  it("Tracked fan-out queries", async () => {
    at("/app/sites/site_1/google/fan-out");
    answer({
      "sites:getMySite": SITE,
      "siteGoogle:listSearches": STANDINGS,
      "siteAngles:listTrackedFanOut": FAN_OUT,
    });
    const { container } = render(<SiteTrackedFanOutPage />);
    await screen.findByText("AI consultants London 1");
    await expectApprovedLook(container, PLAN, "TrackedFanOut", "Discovery → Websites → Tracked fan-out queries");
  });

  it("Your pages", async () => {
    at("/app/sites/site_1/your-pages");
    answer({
      "sites:getMySite": SITE,
      "yourPages:listYourPages": YOUR_PAGES,
    });
    const { container } = render(<SiteYourPagesPage />);
    await screen.findByText("/ai-agency/");
    await expectApprovedLook(container, PLAN, "YourPages", "Discovery → Websites → Your pages");
  });
});
