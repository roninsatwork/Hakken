import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { PAGE_ROW, ROW, STATUS, SUMMARY, TRACKING, list } from "@/src/test/searchConsoleFixtures";
import SearchConsoleDemandPage from "./[siteId]/missed-demand/page";
import SearchConsoleCompetingPage from "./[siteId]/pages-competing/page";
import SearchConsoleTypesPage from "./[siteId]/types/page";
import SearchConsoleBrandPage from "./[siteId]/brand-and-non-brand/page";
import SearchConsoleCtrCurvePage from "./[siteId]/click-rate-by-position/page";
import SearchConsoleAppearancePage from "./[siteId]/rich-results/page";
import SearchConsoleEstimatesPage from "./[siteId]/real-against-estimated/page";

/**
 * Search Console's last opportunities and its breakdowns hold to the looks
 * Anthony approved on the "Search Console — keywords and pages" canvas
 * (design-drift-plan D4): Missed demand, Pages competing, Types, Brand and
 * non-brand, Click rate by position, Rich results and Real against
 * estimated, each rendered with sample rows in English, read as the outline
 * saved beside its board in docs/plans/assets/search-console-redesign/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
// A chart card's caption names the platform: the root layout's settings, not rendered here.
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "search-console-redesign";

/** A summary with no kinds of its own, for the lists below to add to. */
const BASE = { ...SUMMARY, types: [] };

/** A keyword many people search for that Google barely shows the website for. */
const MISSED_ROW = { ...ROW, impressions: 12, clicks: 0, ctr: 0, position: 18.2, volume: 2400 };
const MISSED = { ...list([MISSED_ROW]), summary: { ...BASE, rows: 1, of: 69, volume: 2400 } };

/** A keyword two of the website's pages were shown for, splitting its clicks. */
const COMPETING_ROW = {
  ...ROW, count: 2, top: "https://acme-shop.test/ai-agency/", topShare: 0.7, next: "https://acme-shop.test/services/ai/", nextShare: 0.3,
};
const COMPETING = { ...list([COMPETING_ROW]), summary: { ...BASE, rows: 1, of: 69, pagesInvolved: 2, pagesShown: 12 } };

/** The website's pages by kind, and its keywords by what the searcher wants. */
const PAGE_KINDS = {
  ...list([]),
  summary: { ...BASE, rows: 4, clicks: 100, kinds: [{ kind: "ARTICLE", rows: 3, clicks: 60 }, { kind: "SERVICE", rows: 1, clicks: 40 }] },
};
const KEYWORD_KINDS = {
  ...list([]),
  summary: {
    ...BASE, rows: 6, clicks: 100,
    kinds: [{ kind: "RESEARCHING", rows: 3, clicks: 40 }, { kind: "BUYING", rows: 2, clicks: 35 }, { kind: "BRANDED", rows: 1, clicks: 25 }],
  },
};

/** Brand clicks against every other search, now and the 30 days before. */
const BRANDED = {
  ...list([{ ...ROW, brand: false }]),
  summary: {
    ...BASE,
    brand: {
      now: { brandClicks: 20, nonBrandClicks: 98, brandImpressions: 900, nonBrandImpressions: 6703 },
      before: { brandClicks: 18, nonBrandClicks: 81, brandImpressions: 850, nonBrandImpressions: 6100 },
    },
  },
};
const BRAND_WORDS = { names: ["acme"], profileHref: "/admin/companies/company_1/websites/site/hold_1/profile" };
/** Two weeks of brand and other clicks for the chart. */
const BRAND_PERIODS = {
  periods: [
    { start: "2026-09-14", lastDay: "2026-09-20", days: 7, length: 7, top3: 0, top10: 0, top20: 0, rest: 0, brandClicks: 9, otherClicks: 44 },
    { start: "2026-09-21", lastDay: "2026-09-27", days: 6, length: 7, top3: 0, top10: 0, top20: 0, rest: 0, brandClicks: 11, otherClicks: 54 },
  ],
  step: "week", byWeek: false, reach: null, chartWeeks: 16, notReady: false, preparing: false, notBuilt: false,
};

/** The website's click rate at its first two positions. */
const CURVE = {
  live: false,
  preparing: false,
  points: [
    { position: 1, keywords: 3, impressions: 1564, clicks: 313, ctr: 313 / 1564 },
    { position: 2, keywords: 5, impressions: 2210, clicks: 221, ctr: 0.1 },
  ],
};

/** One kind of rich result, its pages counted after the collection. */
const RICH = {
  rows: [{ ...ROW, key: "REVIEW_SNIPPET", count: 3 }],
  preparing: false, current: true, named: 1, listed: 1, comparable: true, live: false, from: "2026-08-28", to: "2026-09-26",
};
/** The website's clicks in the dates, for Rich results' share of all clicks. */
const PERFORMANCE = {
  days: [
    { day: "2026-09-25", clicks: 38, impressions: 1900, ctr: 0.02, position: 6 },
    { day: "2026-09-26", clicks: 44, impressions: 2000, ctr: 0.022, position: 5.9 },
  ],
  totals: { clicks: 82, impressions: 3900, ctr: 82 / 3900, position: 5.95 },
  previous: null, named: null, live: false,
};

/** A page whose Sites estimate is well over Google's clicks. */
const ESTIMATED_ROW = { ...PAGE_ROW, kind: "ARTICLE", estimate: 120, gap: 76, verdict: "high" };
const ESTIMATES = { ...list([ESTIMATED_ROW]), summary: { ...BASE, estimate: 120, high: 1, low: 0 } };

/**
 * Answers each Convex read by its name; an answer given as a function is
 * asked with the read's arguments (Types reads keywords and pages alike).
 */
function answer(queries: Record<string, unknown>) {
  const reply = answerQueries(queries) as unknown as (reference: unknown, args: unknown) => unknown;
  vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
    const found = reply(reference, args);
    return typeof found === "function" ? (found as (args: unknown) => unknown)(args) : found;
  }) as never);
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
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

describe("Search Console's approved looks: missed demand, pages competing and the breakdowns", () => {
  it("11 · Missed demand", async () => {
    at("/app/search-console/site_1/missed-demand");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": MISSED,
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    const { container } = render(<SearchConsoleDemandPage />);
    await screen.findByText("ai agency");
    await expectApprovedLook(container, PLAN, "Demand", "Search Console → Missed demand");
  });

  it("12 · Pages competing", async () => {
    at("/app/search-console/site_1/pages-competing");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": COMPETING,
    });
    const { container } = render(<SearchConsoleCompetingPage />);
    await screen.findByText("ai agency");
    await expectApprovedLook(container, PLAN, "Competing", "Search Console → Pages competing");
  });

  it("13 · Types", async () => {
    at("/app/search-console/site_1/types");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": (args: { dimension: string }) => (args.dimension === "page" ? PAGE_KINDS : KEYWORD_KINDS),
      "pageKinds:pageKindChoices": null,
    });
    const { container } = render(<SearchConsoleTypesPage />);
    await screen.findByText("Article");
    await expectApprovedLook(container, PLAN, "Types", "Search Console → By page classification");
  });

  it("14 · Brand and non-brand", async () => {
    at("/app/search-console/site_1/brand-and-non-brand");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": BRANDED,
      "searchConsoleChanges:searchConsoleBrandWords": BRAND_WORDS,
      "searchConsolePeriods:searchConsoleChartFigures": BRAND_PERIODS,
    });
    const { container } = render(<SearchConsoleBrandPage />);
    await screen.findByText("ai agency");
    await expectApprovedLook(container, PLAN, "Brand", "Search Console → Brand and non-brand");
  });

  it("15 · Click rate by position", async () => {
    at("/app/search-console/site_1/click-rate-by-position");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleChanges:searchConsoleCurve": CURVE,
    });
    const { container } = render(<SearchConsoleCtrCurvePage />);
    await screen.findByText("1,564");
    await expectApprovedLook(container, PLAN, "CtrCurve", "Search Console → Click rate by position");
  });

  it("16 · Rich results", async () => {
    at("/app/search-console/site_1/rich-results");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleSplitList": RICH,
      "searchConsoleReads:searchConsolePerformance": PERFORMANCE,
    });
    const { container } = render(<SearchConsoleAppearancePage />);
    await screen.findByText("Review snippet");
    await expectApprovedLook(container, PLAN, "Appearance", "Search Console → Rich results");
  });

  it("17 · Real against estimated", async () => {
    at("/app/search-console/site_1/real-against-estimated");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": ESTIMATES,
      "pageKinds:pageKindChoices": null,
    });
    const { container } = render(<SearchConsoleEstimatesPage />);
    await screen.findAllByText(/ai-agency/);
    await expectApprovedLook(container, PLAN, "Estimates", "Search Console → Real against estimated");
  });
});
