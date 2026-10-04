import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import { PAGE_ROW, ROW, STATUS, TRACKING, list } from "@/src/test/searchConsoleFixtures";
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
const SERIES = { ok: true, days: DAYS, totals: TOTALS, previous: BEFORE, previousHeld: true };
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
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
});
afterEach(cleanup);

describe("Search Console's approved looks: pages and keywords", () => {
  it("1 · Pages", async () => {
    at("/app/search-console/site_1/pages");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleReads:searchConsolePerformance": PERFORMANCE,
      "searchConsoleLists:searchConsoleListPage": list([PAGE_ROW]),
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
      "pageKinds:pageKindChoices": null,
    });
    const { container } = render(<SearchConsolePagesPage />);
    await screen.findByText("/ai-agency/");
    await screen.findByText("Click-through rate");
    await expectApprovedLook(container, PLAN, "Main", "Search Console → Pages");
  });

  it("2 · A page's own screen", async () => {
    at("/app/search-console/site_1/pages/page", `key=${encodeURIComponent(PAGE_ROW.key)}`);
    answer(
      {
        "searchConsoleConnect:searchConsoleStatus": STATUS,
        "searchConsoleLists:searchConsoleListPage": list([ROW]),
        "searchConsoleTracking:searchConsoleTracking": TRACKING,
        "searchConsoleTracking:searchConsoleIsTracked": true,
      },
      { searchConsoleKeySeries: SERIES, searchConsoleKeySplits: SPLITS },
    );
    const { container } = render(<SearchConsolePagePage />);
    await screen.findByText("ai agency");
    await screen.findByText("Click-through rate");
    await screen.findByText("United Kingdom");
    await expectApprovedLook(container, PLAN, "Page", "Search Console → Pages → a page");
  });

  it("3 · A keyword's own screen", async () => {
    at("/app/search-console/site_1/keywords/keyword", `key=${encodeURIComponent(ROW.key)}`);
    answer(
      {
        "searchConsoleConnect:searchConsoleStatus": STATUS,
        "searchConsoleLists:searchConsoleListPage": list([PAGE_ROW]),
        "searchConsoleTracking:searchConsoleTracking": TRACKING,
        "searchConsoleTracking:searchConsoleIsTracked": true,
      },
      { searchConsoleKeySeries: SERIES, searchConsoleKeySplits: SPLITS },
    );
    const { container } = render(<SearchConsoleKeywordPage />);
    await screen.findByText("/ai-agency/");
    await screen.findByText("Click-through rate");
    await screen.findByText("United Kingdom");
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
