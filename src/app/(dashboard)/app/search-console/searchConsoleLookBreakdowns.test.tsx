import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { ROW, STATUS, SUMMARY, list } from "@/src/test/searchConsoleFixtures";
import SearchConsoleCompetingPage from "./[siteId]/pages-competing/page";
import SearchConsoleBrandPage from "./[siteId]/brand-and-non-brand/page";
import SearchConsoleCtrCurvePage from "./[siteId]/click-rate-by-position/page";
import SearchConsoleAppearancePage from "./[siteId]/rich-results/page";

/**
 * Search Console's last opportunities and its breakdowns hold to the looks
 * Anthony approved on the "Search Console — keywords and pages" canvas
 * (design-drift-plan D4): Keyword cannibalisation, Brand and non-brand, Click
 * rate by position and Rich results, each rendered with sample rows in English,
 * read as the outline saved beside its board in
 * docs/plans/assets/search-console-redesign/look/. By page classification and
 * Real against estimated were taken out on 2026-11-20, their looks with them.
 * Brand and non-brand (Way 1), Click rate by position (Way 3) and Rich results
 * (Way 3) were approved again the same day, their looks beside the picked boards
 * in docs/plans/assets/search-console-breakdowns/ (search-console-breakdowns-plan-2026-11-20.md).
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

/** The three breakdowns as Anthony picked them on 20 November 2026. */
const BREAKDOWNS = "search-console-breakdowns";

/** A summary with no kinds of its own, for the lists below to add to. */
const BASE = { ...SUMMARY, types: [] };

/** A keyword many people search for that Google barely shows the website for. */

/** A keyword two of the website's pages were shown for, splitting its clicks. */
const COMPETING_ROW = {
  ...ROW, count: 2, top: "https://acme-shop.test/ai-agency/", topShare: 0.7, next: "https://acme-shop.test/services/ai/", nextShare: 0.3,
};
const COMPETING = { ...list([COMPETING_ROW]), summary: { ...BASE, rows: 1, of: 69, pagesInvolved: 2, pagesShown: 12 } };


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

/** The website's click rate at its first two positions, on mobile and on desktop too. */
const CURVE_POINTS = [
  { position: 1, keywords: 3, impressions: 1564, clicks: 313, ctr: 313 / 1564 },
  { position: 2, keywords: 5, impressions: 2210, clicks: 221, ctr: 0.1 },
];
const CURVE = {
  live: false,
  preparing: false,
  points: CURVE_POINTS,
  before: CURVE_POINTS.map((point) => ({ ...point, clicks: point.clicks - 20, ctr: (point.clicks - 20) / point.impressions })),
  devices: { mobile: CURVE_POINTS, desktop: CURVE_POINTS.map((point) => ({ ...point, clicks: point.clicks / 2, ctr: point.ctr / 2 })), cut: null },
};

/** One kind of rich result, its pages counted after the collection, and its clicks the month before. */
const RICH = {
  rows: [{ ...ROW, key: "REVIEW_SNIPPET", count: 3, previousClicks: 30 }],
  preparing: false, current: true, named: 1, listed: 1, comparable: true, live: false, from: "2026-08-28", to: "2026-09-26",
};
/** The website's clicks in the dates, for Rich results' share of all clicks. */
const PERFORMANCE = {
  days: [
    { day: "2026-09-25", clicks: 38, impressions: 1900, ctr: 0.02, position: 6 },
    { day: "2026-09-26", clicks: 44, impressions: 2000, ctr: 0.022, position: 5.9 },
  ],
  totals: { clicks: 82, impressions: 3900, ctr: 82 / 3900, position: 5.95 },
  previous: { clicks: 70, impressions: 3500, ctr: 0.02, position: 6.1 },
  named: null, live: false,
};
/** Rich results' six months: every click, and each month's kinds. */
const LOOK_MONTHS = {
  notReady: false,
  months: ["2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"].map((month, at) => ({
    month, days: 30, clicks: 80 + at, looks: [{ key: "REVIEW_SNIPPET", clicks: 30 + at, impressions: 900 }],
  })),
};


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
  // A fixed day, the one after the fixtures' newest: the screens' calendar periods count from today (AGENTS.md, "A test whose rows carry fixed days runs on a fixed day").
  useScreenDay("2026-09-27");
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Search Console's approved looks: pages competing and the breakdowns", () => {
  it("12 · Keyword cannibalisation", async () => {
    at("/app/search-console/site_1/pages-competing");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": COMPETING,
    });
    const { container } = render(<SearchConsoleCompetingPage />);
    await screen.findByText("ai agency");
    // Approved again as Way 3 on 20 November 2026 (search-console-keyword-cannibalisation-way-3-plan-2026-11-20.md).
    await expectApprovedLook(container, "search-console-keyword-cannibalisation-way-3", "Competing", "Search Console → Keyword cannibalisation");
  });

  it("14 · Brand and non-brand", async () => {
    at("/app/search-console/site_1/brand-and-non-brand");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": BRANDED,
      "searchConsoleChanges:searchConsoleBrandWords": BRAND_WORDS,
      "searchConsolePeriods:searchConsoleChartFigures": BRAND_PERIODS,
      "searchConsoleReads:searchConsolePerformance": PERFORMANCE,
    });
    const { container } = render(<SearchConsoleBrandPage />);
    await screen.findByText("ai agency");
    await screen.findByText("Clicks from brand searches");
    await expectApprovedLook(container, BREAKDOWNS, "Brand", "Search Console → Brand and non-brand");
  });

  it("15 · Click rate by position", async () => {
    at("/app/search-console/site_1/click-rate-by-position");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleChanges:searchConsoleCurve": CURVE,
    });
    const { container } = render(<SearchConsoleCtrCurvePage />);
    await screen.findByText("1,564");
    await expectApprovedLook(container, BREAKDOWNS, "CtrCurve", "Search Console → Click rate by position");
  });

  it("16 · Rich results", async () => {
    at("/app/search-console/site_1/rich-results");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleSplitList": RICH,
      "searchConsoleReads:searchConsolePerformance": PERFORMANCE,
      "searchConsoleBreakdowns:searchConsoleLookMonths": LOOK_MONTHS,
      "searchConsoleLists:searchConsoleListPage": { ...list([ROW]), summary: { ...BASE, rows: 12 } },
    });
    const { container } = render(<SearchConsoleAppearancePage />);
    await screen.findByText("Review snippet");
    await screen.findByText("Clicks from rich results");
    await expectApprovedLook(container, BREAKDOWNS, "Appearance", "Search Console → Rich results");
  });
});
