import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { PAGE_ROW, ROW, STATUS, SUMMARY, TRACKING, list } from "@/src/test/searchConsoleFixtures";
import SearchConsoleBandsPage from "./[siteId]/position-bands/page";
import SearchConsoleNewLostPage from "./[siteId]/new-and-lost/page";
import SearchConsoleWinsPage from "./[siteId]/wins-and-losses/page";
import SearchConsoleUpdatesPage from "./[siteId]/google-updates/page";
import SearchConsoleAlmostPage from "./[siteId]/almost-there/page";
import SearchConsoleLowCtrPage from "./[siteId]/shown-but-not-clicked/page";

/**
 * Search Console's change and opportunity screens hold to the looks Anthony
 * approved on the "Search Console — keywords and pages" canvas
 * (design-drift-plan D4): Position bands, New and lost, Wins and losses,
 * Google updates, Almost there and Shown but not clicked, each rendered with
 * sample rows in English, read as the outline saved beside its board in
 * docs/plans/assets/search-console-redesign/look/.
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
// The charts' captions name the platform.
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "search-console-redesign";

/** The same keywords' bands the days before: every band box has its change. */
const BANDED = { ...SUMMARY, bandsBefore: { "1-3": 0, "4-10": 1, "11-20": 1, "21-50": 0, "51+": 0 } };

/** Two weeks of position bands for the chart. */
const BAND_PERIODS = {
  periods: [
    { start: "2026-09-14", lastDay: "2026-09-20", days: 7, length: 7, top3: 0, top10: 1, top20: 1, rest: 0, brandClicks: 0, otherClicks: 0 },
    { start: "2026-09-21", lastDay: "2026-09-27", days: 6, length: 7, top3: 0, top10: 2, top20: 0, rest: 0, brandClicks: 0, otherClicks: 0 },
  ],
  step: "week", byWeek: false, reach: null, chartWeeks: 16, notReady: false, preparing: false, notBuilt: false,
};

/** One keyword new in the dates, and the weeks the chart counts it in. */
const NEW_LOST = {
  rows: [{ key: "ai agency", status: "new", when: "2026-09-20", clicks: 4, impressions: 120, position: 6.2, band: "4-10" }],
  total: 1, page: 1, pages: 1, size: 25, cut: null, preparing: false, notReady: false, watchedFrom: null,
  counts: { newKeywords: 1, lostKeywords: 0, newPages: 0, lostPages: 0 },
  periods: [
    { start: "2026-09-14", lastDay: "2026-09-20", gained: 1, lost: 0 },
    { start: "2026-09-21", lastDay: "2026-09-26", gained: 0, lost: 0 },
  ],
};

/** One finished Google update with its days before and after. */
const UPDATES = {
  from: "2026-08-28", to: "2026-09-26", live: false,
  updates: [{
    id: "googleUpdates_1", title: "August 2026 core update", description: "", startedOn: "2026-08-30", finishedOn: "2026-09-05",
    url: "https://status.search.google.com/", state: "done",
    before: { clicks: 300, impressions: 12000, ctr: 0.025, position: 6.1 },
    after: { clicks: 340, impressions: 13000, ctr: 0.026, position: 5.8 },
  }],
};

/** The website's clicks day by day, for Google updates' chart. */
const PERFORMANCE = {
  days: [
    { day: "2026-09-25", clicks: 38, impressions: 1900, ctr: 0.02, position: 6 },
    { day: "2026-09-26", clicks: 44, impressions: 2000, ctr: 0.022, position: 5.9 },
  ],
  totals: { clicks: 82, impressions: 3900, ctr: 82 / 3900, position: 5.95 },
  previous: null, named: null, live: false,
};

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
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

describe("Search Console's approved looks: changes and opportunities", () => {
  it("5 · Position bands", async () => {
    at("/app/search-console/site_1/position-bands");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": { ...list([ROW]), summary: BANDED },
      "searchConsolePeriods:searchConsoleChartFigures": BAND_PERIODS,
    });
    const { container } = render(<SearchConsoleBandsPage />);
    await screen.findByText("ai agency");
    await expectApprovedLook(container, PLAN, "Bands", "Search Console → Position bands");
  });

  it("6 · New and lost", async () => {
    at("/app/search-console/site_1/new-and-lost");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleChanges:searchConsoleNewLost": NEW_LOST,
    });
    const { container } = render(<SearchConsoleNewLostPage />);
    await screen.findByText("ai agency");
    await expectApprovedLook(container, PLAN, "NewLost", "Search Console → New and lost");
  });

  it("7 · Wins and losses", async () => {
    at("/app/search-console/site_1/wins-and-losses");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": list([ROW]),
    });
    const { container } = render(<SearchConsoleWinsPage />);
    await screen.findByText("ai agency");
    await expectApprovedLook(container, PLAN, "Moves", "Search Console → Wins and losses");
  });

  it("8 · Google updates", async () => {
    at("/app/search-console/site_1/google-updates");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleChanges:searchConsoleUpdates": UPDATES,
      "searchConsoleReads:searchConsolePerformance": PERFORMANCE,
      "googleUpdates:listGoogleUpdatesBetween": [],
    });
    const { container } = render(<SearchConsoleUpdatesPage />);
    await screen.findByText("August 2026 core update");
    await expectApprovedLook(container, PLAN, "Updates", "Search Console → Google updates");
  });

  it("9 · Almost there", async () => {
    at("/app/search-console/site_1/almost-there");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": { ...list([{ ...ROW, volume: 880 }]), summary: { ...BANDED, volume: 880 } },
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    const { container } = render(<SearchConsoleAlmostPage />);
    await screen.findByText("ai agency");
    await expectApprovedLook(container, PLAN, "Almost", "Search Console → Almost there");
  });

  it("10 · Shown but not clicked", async () => {
    at("/app/search-console/site_1/shown-but-not-clicked");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": list([{ ...PAGE_ROW, usualCtr: 0.06, expected: 94 }]),
      "pageKinds:pageKindChoices": null,
    });
    const { container } = render(<SearchConsoleLowCtrPage />);
    await screen.findAllByText(/ai-agency/);
    await expectApprovedLook(container, PLAN, "LowCtr", "Search Console → Shown but not clicked");
  });
});
