import { cleanup, fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { expectWords } from "@/src/test/seenWords";
import { ROW, STATUS, list } from "@/src/test/searchConsoleFixtures";
import SearchConsoleVolatilityPage from "./[siteId]/volatility/page";
import { findSaid, openHakkenSees } from "@/src/test/openHakkenSees";

/**
 * Search Console → Volatility holds to the look Anthony approved on the
 * "Hakken Volatility" canvas (search-console-volatility-plan.md §2.1, board
 * 1): What Hakken sees, four figures, the score day by day, and the keywords
 * that moved — rendered with sample rows in English, read as the outline
 * saved beside its board in docs/plans/assets/search-console-volatility/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1/volatility", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

/** ronins.co.uk's own numbers, October 2026: Google's September spam update moved its positions 40% more than usual. */
const SEEN = {
  says: [
    { code: "updateMoved", text: "September 2026 spam update", a: 40, days: ["2026-09-24", "2026-10-08"] },
    { code: "clicksFellWithIt", a: 21 },
    { code: "pointsToGoogle" },
  ],
  steps: [
    { code: "holdUntil", days: ["2026-10-22"], link: "seeUpdate", to: { segment: "google-updates" } },
    { code: "checkDropped", a: 6, link: "seeKeywords", to: { segment: "volatility", filters: { way: "down" } } },
    { code: "pagesIfNotBack", days: ["2026-10-22"], link: "seePages", to: { segment: "pages" } },
  ],
};
const FACTS = {
  live: false,
  newestDay: "2026-10-09",
  latest: { day: "2026-10-08", volatility: 1.9, level: "NORMAL", keywords: 120, movedUp5: 3, movedDown5: 6 },
  usual: 1.5,
  update: { title: "September 2026 spam update", url: "https://status.search.google.com/", startedOn: "2026-09-24", finishedOn: "2026-10-08", before: 1.5, during: 2.1 },
  week: { now: 2.2, before: 2.0 },
  clicks: { now: 70, before: 89 },
  seen: SEEN,
};
const CHART = {
  periods: [
    { start: "2026-10-07", lastDay: "2026-10-07", days: 1, length: 1, top3: 0, top10: 0, top20: 0, rest: 0, brandClicks: 0, otherClicks: 0, volatility: 2.4, volatilityUp: 0.9, volatilityDown: 1.5 },
    { start: "2026-10-08", lastDay: "2026-10-08", days: 1, length: 1, top3: 0, top10: 0, top20: 0, rest: 0, brandClicks: 0, otherClicks: 0, volatility: 1.9, volatilityUp: 0.7, volatilityDown: 1.2 },
  ],
  step: "day", byWeek: false, reach: null, chartWeeks: 16, notReady: false, preparing: false, notBuilt: false,
};

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  // A mutation answers a promise, as Convex's do: the eye, opened on the page's own figures, asks its writer, who has no answer here.
  vi.mocked(useMutation).mockImplementation((() => vi.fn(async () => undefined)) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

describe("Volatility's approved look", () => {
  beforeEach(() => {
    // A fixed day, the one after the fixtures' newest: the screens' calendar periods count from today (AGENTS.md, "A test whose rows carry fixed days runs on a fixed day").
    useScreenDay("2026-10-10");
    nav.search = "range=30";
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("1 · Volatility", async () => {
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": list([{ ...ROW, previousPosition: 4.2, positionChange: -6.8 }]),
      "searchConsoleVolatility:searchConsoleVolatility": FACTS,
      "searchConsolePeriods:searchConsoleChartFigures": CHART,
      "googleUpdates:listGoogleUpdatesBetween": [],
    });
    const { container } = render(<SearchConsoleVolatilityPage />);
    await screen.findByText("ai agency");
    await openHakkenSees();
    // The rule's words stand once the writer has no answer.
    expect(await findSaid(/Google's September 2026 spam update ran from/)).toBeInTheDocument();
    await expectApprovedLook(container, "search-console-volatility", "Main", "Search Console → Volatility");
  });

  it("its Show menu picks the score and its two parts, Positions improved and declined, and says what to tick when none is (2026-11-20)", async () => {
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": list([ROW]),
      "searchConsoleVolatility:searchConsoleVolatility": FACTS,
      "searchConsolePeriods:searchConsoleChartFigures": CHART,
      "googleUpdates:listGoogleUpdatesBetween": [],
    });
    render(<SearchConsoleVolatilityPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Show: Every line/ }));
    expect(screen.getAllByRole("checkbox").map((box) => box.closest("label")?.textContent?.trim())).toEqual(expect.arrayContaining(["Volatility", "Positions improved", "Positions declined"]));
    fireEvent.click(screen.getByRole("checkbox", { name: "Positions improved" }));
    expect(screen.getByRole("button", { name: /Show: Volatility, Positions declined/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(screen.getByText("Tick a line in the Show menu to draw it here.")).toBeInTheDocument();
    // Every day here has its parts: nothing to say about where they start.
    expect(screen.queryByText(/Positions improved and declined start on/)).not.toBeInTheDocument();
  });

  it("says where the two parts start when the score reaches back further, and when none is kept yet", async () => {
    const [older, newer] = CHART.periods;
    const { volatilityUp: _up, volatilityDown: _down, ...olderAlone } = older;
    const { volatilityUp: _newerUp, volatilityDown: _newerDown, ...newerAlone } = newer;
    const answerWith = (periods: unknown[]) => answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": list([ROW]),
      "searchConsoleVolatility:searchConsoleVolatility": FACTS,
      "searchConsolePeriods:searchConsoleChartFigures": { ...CHART, periods },
      "googleUpdates:listGoogleUpdatesBetween": [],
    });
    answerWith([olderAlone, newer]);
    render(<SearchConsoleVolatilityPage />);
    expect(await screen.findByText("Positions improved and declined start on 8 Oct. Google's figures for each day before then aren't kept.")).toBeInTheDocument();
    cleanup();
    answerWith([olderAlone, newerAlone]);
    render(<SearchConsoleVolatilityPage />);
    expect(await screen.findByText("Positions improved and declined show after the next collection.")).toBeInTheDocument();
  });

  it("every sentence its box can say has its words, in English and Italian", () => {
    expectWords("volatility", SEEN, "searchConsole.seen");
  });
});
