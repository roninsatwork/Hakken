import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { expectWords } from "@/src/test/seenWords";
import { ROW, STATUS, list } from "@/src/test/searchConsoleFixtures";
import SearchConsoleVolatilityPage from "./[siteId]/volatility/page";

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
    { start: "2026-10-07", lastDay: "2026-10-07", days: 1, length: 1, top3: 0, top10: 0, top20: 0, rest: 0, brandClicks: 0, otherClicks: 0, volatility: 2.4 },
    { start: "2026-10-08", lastDay: "2026-10-08", days: 1, length: 1, top3: 0, top10: 0, top20: 0, rest: 0, brandClicks: 0, otherClicks: 0, volatility: 1.9 },
  ],
  step: "day", byWeek: false, reach: null, chartWeeks: 16, notReady: false, preparing: false, notBuilt: false,
};

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
}

describe("Volatility's approved look", () => {
  beforeEach(() => {
    nav.search = "range=30";
  });
  afterEach(() => cleanup());

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
    expect(screen.getByText(/Google's September 2026 spam update ran from/)).toBeInTheDocument();
    await expectApprovedLook(container, "search-console-volatility", "Main", "Search Console → Volatility");
  });

  it("every sentence its box can say has its words, in English and Italian", () => {
    expectWords("volatility", SEEN, "searchConsole.seen");
  });
});
