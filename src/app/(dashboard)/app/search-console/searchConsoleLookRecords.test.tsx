import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi, expect } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { PAGE_ROW, ROW, STATUS, SUMMARY, TRACKING, list } from "@/src/test/searchConsoleFixtures";
import SearchConsolePagesPage from "./[siteId]/pages/page";
import SearchConsolePagePage from "./[siteId]/pages/page/page";
import SearchConsoleKeywordsPage from "./[siteId]/keywords/page";
import SearchConsoleKeywordPage from "./[siteId]/keywords/keyword/page";

/**
 * Search Console's Pages and Keywords, and a page's and a keyword's own
 * screens, hold to the looks Anthony approved on the "Search Console —
 * keywords and pages" canvas (design-drift-plan D4): each screen, rendered
 * with sample rows in English, reads as the outline saved beside its board in
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
// The record screens' chart writes the platform's name into its download's caption.
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "search-console-redesign";

/** The website's figures for the dates chosen, and the same days before. */
const TOTALS = { clicks: 118, impressions: 7603, ctr: 118 / 7603, position: 5.9 };
const BEFORE = { clicks: 99, impressions: 6900, ctr: 99 / 6900, position: 6.4 };
const DAYS = [
  { day: "2026-09-25", clicks: 4, impressions: 250, ctr: 4 / 250, position: 6 },
  { day: "2026-09-26", clicks: 5, impressions: 260, ctr: 5 / 260, position: 5.8 },
];
const PERFORMANCE = { days: DAYS, totals: TOTALS, previous: BEFORE, named: 69, live: false };

/** A keyword's or a page's own days, and where its clicks came from, as Google answers them. */
// The span before's days come with the dates (`daysBefore`): a keyword's day chart lays them under (2026-11-17).
const SERIES = { ok: true, days: DAYS, daysBefore: DAYS, totals: TOTALS, previous: BEFORE, previousHeld: true };
/** One page's keywords, or one keyword's pages, as Google answers them when the screen opens (keep-less-history-plan.md, 5.1). */
const pairsOf = (row: unknown) => ({ ok: true, rows: [[row]], cut: null, named: 44, comparable: true, summary: SUMMARY });
const SPLITS = {
  ok: true,
  countries: [{ key: "gbr", clicks: 30, impressions: 1000, share: 0.68 }, { key: "usa", clicks: 14, impressions: 564, share: 0.32 }],
  devices: [{ key: "DESKTOP", clicks: 32, impressions: 1100, share: 0.73 }, { key: "MOBILE", clicks: 12, impressions: 464, share: 0.27 }],
};

/**
 * Answers each read by its name, and each action asked of Google by the end of
 * its name. An action is one function for the whole test, as Convex's is, so
 * a render never asks Google again; one not answered here never answers.
 */
function answer(queries: Record<string, unknown>, answers: Record<string, unknown> = {}) {
  const actions = new Map<string, ReturnType<typeof vi.fn>>();
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation(((reference: unknown) => {
    const name = convexPath(reference);
    if (!actions.has(name)) {
      const match = Object.keys(answers).find((suffix) => name.endsWith(suffix));
      actions.set(name, match ? vi.fn(() => Promise.resolve(answers[match])) : vi.fn(() => new Promise(() => undefined)));
    }
    return actions.get(name);
  }) as never);
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

describe("Search Console's approved looks: pages and keywords", () => {
  it("1 · Pages", async () => {
    // Way 1 (search-console-pages-way-1-plan-2026-11-17.md): the boxes every country's, the line under them, the busiest
    // page ticked and drawn day by day, and the table with its tick boxes.
    at("/app/search-console/site_1/pages");
    answer(
      {
        "searchConsoleConnect:searchConsoleStatus": STATUS,
        "searchConsoleReads:searchConsolePerformance": PERFORMANCE,
        "searchConsoleLists:searchConsoleListPage": list([PAGE_ROW]),
        "searchConsoleTracking:searchConsoleTracking": TRACKING,
        "pageKinds:pageKindChoices": null,
        "pageTitles:pageTitlesFor": [],
      },
      { searchConsoleKeySeries: SERIES },
    );
    const { container } = render(<SearchConsolePagesPage />);
    await screen.findByText("/ai-agency/");
    await screen.findByText("Click-through rate");
    await screen.findByText("Clicks each day");
    // It opens with its busiest pages ticked: here the one page with clicks.
    expect(screen.getAllByRole("checkbox").filter((box) => (box as HTMLInputElement).checked)).toHaveLength(1);
    await expectApprovedLook(container, PLAN, "Main", "Search Console → Pages");
  });

  it("2 · A page's own screen", async () => {
    at("/app/search-console/site_1/pages/page", `key=${encodeURIComponent(PAGE_ROW.key)}`);
    answer(
      {
        "searchConsoleConnect:searchConsoleStatus": STATUS,
        "searchConsoleTracking:searchConsoleTracking": TRACKING,
        "searchConsoleTracking:searchConsoleIsTracked": true,
      },
      { searchConsoleKeySeries: SERIES, searchConsoleKeySplits: SPLITS, searchConsoleLiveList: pairsOf(ROW) },
    );
    const { container } = render(<SearchConsolePagePage />);
    // The keyword screen's Way 2, turned round (Anthony, 17 November 2026: "just build it"): the keyword is named in the
    // bands and in the table, and where the clicks came from is gone, so its countries aren't asked.
    expect(await screen.findAllByText("ai agency")).toHaveLength(2);
    // In its box, and among the day chart's Show choices.
    expect(await screen.findAllByText("Click-through rate")).toHaveLength(2);
    await screen.findByText("Which keywords Google shows this page for, and which get clicked");
    await expectApprovedLook(container, PLAN, "Page", "Search Console → Pages → a page");
  });

  it("3 · A keyword's own screen", async () => {
    at("/app/search-console/site_1/keywords/keyword", `key=${encodeURIComponent(ROW.key)}`);
    answer(
      {
        "searchConsoleConnect:searchConsoleStatus": STATUS,
        "searchConsoleTracking:searchConsoleTracking": TRACKING,
        "searchConsoleTracking:searchConsoleIsTracked": true,
      },
      { searchConsoleKeySeries: SERIES, searchConsoleKeySplits: SPLITS, searchConsoleLiveList: pairsOf(PAGE_ROW) },
    );
    const { container } = render(<SearchConsoleKeywordPage />);
    // Way 2 (search-console-keyword-screen-way-2-plan-2026-11-17.md): the page is named in the bands and in the table,
    // and where the clicks came from is gone, so its countries aren't asked.
    expect(await screen.findAllByText("/ai-agency/")).toHaveLength(2);
    // In its box, and among the day chart's Show choices.
    expect(await screen.findAllByText("Click-through rate")).not.toHaveLength(0);
    expect(screen.queryByText("United Kingdom")).toBeNull();
    await expectApprovedLook(container, PLAN, "Keyword", "Search Console → Keywords → a keyword");
  });

  it("4 · Keywords", async () => {
    at("/app/search-console/site_1/keywords");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleReads:searchConsolePerformance": PERFORMANCE,
      "searchConsoleLists:searchConsoleListPage": list([ROW]),
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    const { container } = render(<SearchConsoleKeywordsPage />);
    await screen.findByText("ai agency");
    await screen.findByText("Click-through rate");
    await expectApprovedLook(container, PLAN, "Keywords", "Search Console → Keywords");
  });
});
