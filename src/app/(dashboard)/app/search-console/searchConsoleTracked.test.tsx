import { cleanup, fireEvent, renderWithProviders as render, screen, waitFor, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import { SearchConsoleMenu } from "./_components/SearchConsoleMenu";
import SearchConsoleTrackedKeywordsPage from "./[siteId]/tracked/keywords/page";
import SearchConsoleTrackedPagesPage from "./[siteId]/tracked/pages/page";
import SearchConsoleKeywordPage from "./[siteId]/keywords/keyword/page";
import { STARTING_CONSOLE_LIMITS } from "@/src/test/searchConsoleLimits";

/**
 * Tracked keywords and Tracked pages (drawn and approved 2026-10-03): a
 * Tracked group first in the menu, open, each page with its count; each page
 * only the keywords or pages ticked, the four figures for them together, a
 * search box and no chips, unticking taking a row off, and a row opening its
 * own screen with the way back to the tracked list.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1", search: "", replace: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      return Object.assign(t, { rich: t, has: () => false });
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

const STATUS = {
  configured: true,
  owned: true,
  canManage: true,
  host: "acme-shop.test",
  ownSites: [{ siteId: "site_1", host: "acme-shop.test" }],
  historyFrom: "2025-05-26", limits: STARTING_CONSOLE_LIMITS,
  connection: {
    status: "CONNECTED", signingIn: false, googleAccount: "owner@acme-shop.test", property: "sc-domain:acme-shop.test", permission: "siteOwner",
    choices: [], connectedAt: Date.parse("2026-09-27T10:00:00Z"), disconnectedAt: null, newestDay: "2026-09-26", oldestDay: "2025-05-26", countriesNewest: [],
    historyDone: true, clearing: false, lastCollectedAt: Date.parse("2026-09-27T10:02:00Z"), problem: null, attempt: null,
  },
};

const ROW = {
  key: "ai agency", clicks: 44, impressions: 1564, ctr: 44 / 1564, position: 4.3, previousClicks: 38, change: 6, share: 0.4,
  band: "4-10", previousPosition: 3.5, positionChange: -0.8, count: 1, top: "https://acme-shop.test/ai-agency/", tracked: true,
  kind: null, volume: null, estimate: null, brand: false, usualCtr: null, expected: null, topShare: null, next: null, nextShare: null, verdict: null, gap: null,
};
const SECOND = { ...ROW, key: "bad websites", clicks: 25, impressions: 1115, ctr: 25 / 1115, position: 6.3, previousClicks: 5, change: 20, previousPosition: 9.1, positionChange: 2.8 };
const SUMMARY = {
  rows: 2, of: 2, clicks: 118, impressions: 7603, previousClicks: 99, position: 5.9, tracked: 2, gaining: 2, losing: 0, gained: 26, lost: 0,
  volume: 0, estimate: 0, expected: 0, high: 0, low: 0, pagesInvolved: null, pagesShown: null,
  bands: { "1-3": 0, "4-10": 2, "11-20": 0, "21-50": 0, "51+": 0 }, bandsBefore: null, brand: null, kinds: [],
};
const LIST = {
  rows: [ROW, SECOND], total: 2, page: 1, pages: 1, size: 25, cut: null, preparing: false, current: true, named: 69, listed: 2, comparable: true,
  live: false, from: "2026-08-28", to: "2026-09-26", summary: SUMMARY,
};
const TRACKING = { keywords: { count: 8, limit: 200 }, pages: { count: 6, limit: 100 } };

let actions: Record<string, ReturnType<typeof vi.fn>> = {};
const track = vi.fn();

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation(((reference: unknown) => (convexPath(reference).endsWith("trackSearchConsoleItem") ? track : vi.fn())) as never);
  vi.mocked(useAction).mockImplementation(((reference: unknown) => {
    const name = convexPath(reference);
    const match = Object.keys(actions).find((suffix) => name.endsWith(suffix));
    if (match) return actions[match];
    actions[name] = vi.fn(() => new Promise(() => undefined));
    return actions[name];
  }) as never);
}

/** What a read was last asked, by the end of its name. */
function askedOf(suffix: string): Array<Record<string, unknown>> {
  return vi.mocked(useQuery).mock.calls
    .filter(([reference, args]) => convexPath(reference).endsWith(suffix) && args !== "skip")
    .map(([, args]) => args as Record<string, unknown>);
}

/** Each test its own page, so the address writes of one never reach the next. */
let pageNumber = 0;
function at(path: string, search = "") {
  pageNumber += 1;
  nav.pathname = `${path}#${pageNumber}`;
  nav.search = search;
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  vi.mocked(useAction).mockReset();
  nav.replace.mockClear();
  nav.push.mockClear();
  track.mockReset().mockResolvedValue(null);
  actions = {};
});
afterEach(cleanup);

describe("the menu's Tracked group", () => {
  it("comes first and open wherever you arrive, holding Tracked keywords and Tracked pages with their counts", () => {
    // Arriving on Performance: Tracked is open from the start, not only because the page read is in it.
    nav.pathname = "/app/search-console/site_1";
    nav.search = "range=30";
    answer({ "searchConsoleTracking:searchConsoleTracking": TRACKING });
    render(<SearchConsoleMenu siteId="site_1" />);
    const menu = screen.getByRole("navigation", { name: "searchConsole.menu.label" });
    const groups = within(menu).getAllByRole("button");
    expect(groups.map((group) => group.textContent)).toEqual([
      "searchConsole.menu.groups.tracked",
      "searchConsole.menu.groups.figures",
      "searchConsole.menu.groups.changes",
      "searchConsole.menu.groups.opportunities",
      "searchConsole.menu.groups.breakdowns",
      "searchConsole.menu.groups.settings",
    ]);
    expect(groups.map((group) => group.getAttribute("aria-expanded"))).toEqual(["true", "true", "false", "false", "false", "false"]);

    const items = within(menu).getAllByRole("link");
    expect(items.slice(0, 3).map((item) => item.getAttribute("href"))).toEqual([
      "/app/search-console/site_1/tracked/keywords?range=30",
      "/app/search-console/site_1/tracked/pages?range=30",
      "/app/search-console/site_1?range=30",
    ]);
    expect(items[0]).toHaveTextContent(/^searchConsole\.menu\.trackedKeywords8$/);
    expect(items[1]).toHaveTextContent(/^searchConsole\.menu\.trackedPages6$/);
    // Counts beside the tracked lists only.
    expect(items[2]).toHaveTextContent(/^searchConsole\.menu\.performance$/);
    expect(items[2]).toHaveAttribute("aria-current", "page");
  });

  it("lights each tracked list on its own address, and a keyword's screen still lights Keywords", () => {
    answer({ "searchConsoleTracking:searchConsoleTracking": TRACKING });
    nav.search = "";
    for (const [path, lit] of [["tracked/keywords", /searchConsole\.menu\.trackedKeywords/], ["tracked/pages", /searchConsole\.menu\.trackedPages/]] as const) {
      nav.pathname = `/app/search-console/site_1/${path}`;
      const { unmount } = render(<SearchConsoleMenu siteId="site_1" />);
      expect(screen.getByRole("link", { name: lit })).toHaveAttribute("aria-current", "page");
      // Keywords and Pages are their own pages, never lit by a tracked list's address.
      expect(screen.getByRole("link", { name: "searchConsole.menu.keywords" })).not.toHaveAttribute("aria-current");
      expect(screen.getByRole("link", { name: "searchConsole.menu.pages" })).not.toHaveAttribute("aria-current");
      unmount();
    }

    nav.pathname = "/app/search-console/site_1/keywords/keyword";
    render(<SearchConsoleMenu siteId="site_1" />);
    expect(screen.getByRole("link", { name: "searchConsole.menu.keywords" })).toHaveAttribute("aria-current", "page");
  });
});

describe("Tracked keywords", () => {
  it("asks for the tracked view and shows the four figures for them together, a search box and no chips", () => {
    at("/app/search-console/site_1/tracked/keywords");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": LIST,
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    render(<SearchConsoleTrackedKeywordsPage />);
    expect(askedOf("searchConsoleListPage").at(-1)).toMatchObject({
      dimension: "query", view: "tracked", from: "2026-08-28", to: "2026-09-26", sort: "clicks", direction: "desc",
    });
    expect(screen.getByText("searchConsole.tracked.keywords.title")).toBeInTheDocument();
    // Clicks with its change on the days before; impressions, click-through rate and position with their notes.
    expect(screen.getByText("118")).toBeInTheDocument();
    expect(screen.getByText("searchConsole.figures.up 19 30")).toBeInTheDocument();
    expect(screen.getByText("7,603")).toBeInTheDocument();
    expect(screen.getByText("searchConsole.tracked.figures.shown")).toBeInTheDocument();
    expect(screen.getByText("1.6%")).toBeInTheDocument();
    expect(screen.getByText("searchConsole.tracked.figures.ctr")).toBeInTheDocument();
    expect(screen.getByText("5.9")).toBeInTheDocument();
    expect(screen.getByText("searchConsole.tracked.figures.position")).toBeInTheDocument();

    expect(screen.getByPlaceholderText("searchConsole.tracked.keywords.searchPlaceholder")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText(/searchConsole\.track\.count 8 200/)).toBeInTheDocument();
    // The columns as drawn: the tick, the keyword, its figures, what changed, its pages and top page.
    const headings = screen.getAllByRole("columnheader").map((heading) => heading.textContent ?? "");
    expect(headings.map((heading) => heading.replace(/\s+/g, ""))).toEqual([
      "searchConsole.track.column", "searchConsole.table.keyword", "searchConsole.table.clicks", "searchConsole.table.change",
      "searchConsole.table.impressions", "searchConsole.table.ctr", "searchConsole.table.position", "searchConsole.table.moved",
      "searchConsole.table.pages", "searchConsole.table.topPage",
    ]);
    const first = screen.getByText("ai agency").closest("tr")!;
    expect(first).toHaveTextContent("▲ 6");
    expect(first).toHaveTextContent("▼ ui.change.places 0.8");
    expect(first).toHaveTextContent("/ai-agency/");
    // Every row is tracked here: none is marked as tracked, as drawn.
    expect(first.className).not.toContain("bg-brand/5");
  });

  it("says nothing of the days before when they aren't held", () => {
    at("/app/search-console/site_1/tracked/keywords");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": { ...LIST, comparable: false, summary: { ...SUMMARY, previousClicks: null } },
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    render(<SearchConsoleTrackedKeywordsPage />);
    expect(screen.getByText("searchConsole.figures.noBefore")).toBeInTheDocument();
    expect(screen.queryByText(/searchConsole\.figures\.up/)).not.toBeInTheDocument();
  });

  it("says so when nothing is tracked", () => {
    at("/app/search-console/site_1/tracked/keywords");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": { ...LIST, rows: [], total: 0, pages: 0, named: 0, listed: 0, summary: { ...SUMMARY, rows: 0, clicks: 0, impressions: 0, previousClicks: 0, position: null } },
      "searchConsoleTracking:searchConsoleTracking": { ...TRACKING, keywords: { count: 0, limit: 200 } },
    });
    render(<SearchConsoleTrackedKeywordsPage />);
    expect(screen.getByText("searchConsole.tracked.keywords.empty")).toBeInTheDocument();
  });

  it("opens a keyword's own screen, whose way back names Tracked keywords and returns to the list as it was left", () => {
    nav.pathname = "/app/search-console/site_1/tracked/keywords";
    nav.search = "range=90&q=agency&sort=position&direction=asc";
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": LIST,
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    const { unmount } = render(<SearchConsoleTrackedKeywordsPage />);
    const href = screen.getByRole("link", { name: "ai agency" }).getAttribute("href") ?? "";
    const [path, query] = href.split("?");
    expect(path).toBe("/app/search-console/site_1/keywords/keyword");
    const address = new URLSearchParams(query);
    expect(address.get("key")).toBe("ai agency");
    expect(address.get("range")).toBe("90");
    const back = address.get("back") ?? "";
    expect(back.split("?")[0]).toBe("/app/search-console/site_1/tracked/keywords");
    expect(Object.fromEntries(new URLSearchParams(back.split("?")[1]))).toEqual({ range: "90", q: "agency", sort: "position", direction: "asc" });
    fireEvent.click(screen.getByText("bad websites").closest("tr")!);
    expect(nav.push).toHaveBeenCalledWith(expect.stringContaining("/app/search-console/site_1/keywords/keyword?"));
    unmount();

    // The keyword's own screen, opened from that link.
    nav.pathname = path;
    nav.search = query;
    render(<SearchConsoleKeywordPage />);
    const way = screen.getByRole("link", { name: /searchConsole\.record\.backTo searchConsole\.menu\.trackedKeywords/ });
    expect(way).toHaveAttribute("href", back);
  });

  it("unticking a row stops tracking it", async () => {
    at("/app/search-console/site_1/tracked/keywords");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": LIST,
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    render(<SearchConsoleTrackedKeywordsPage />);
    const tick = screen.getByRole("checkbox", { name: /searchConsole\.track\.untrackLabel ai agency/ });
    expect(tick).toBeChecked();
    fireEvent.click(tick);
    await waitFor(() => expect(track).toHaveBeenCalledWith({ siteId: "site_1", kind: "query", key: "ai agency", track: false }));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("asked of Google, a row unticked leaves the list and the figures at once", async () => {
    at("/app/search-console/site_1/tracked/keywords", "country=moz");
    actions = {
      searchConsoleLiveList: vi.fn().mockResolvedValue({ ok: true, rows: [[ROW, SECOND]], cut: null, named: 69, comparable: true, summary: SUMMARY }),
    };
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": { ...LIST, rows: [], total: 0, pages: 0, summary: null, live: true },
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
      // "bad websites" was unticked after Google answered.
      "searchConsoleTracking:searchConsoleTrackedKeys": ["ai agency"],
    });
    render(<SearchConsoleTrackedKeywordsPage />);
    expect(await screen.findByText("ai agency")).toBeInTheDocument();
    expect(actions.searchConsoleLiveList).toHaveBeenCalledWith(expect.objectContaining({ dimension: "query", view: "tracked", country: "moz" }));
    expect(screen.queryByText("bad websites")).not.toBeInTheDocument();
    // The figures are the one row left's: 44 clicks, 38 the days before.
    expect(screen.getByText("44", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText("searchConsole.figures.up 6 30")).toBeInTheDocument();
    expect(screen.getByText("1,564", { selector: "div" })).toBeInTheDocument();
  });
});

describe("Tracked pages", () => {
  const PAGE = { ...ROW, key: "https://acme-shop.test/ai-agency/", count: 481, top: "ai agency" };

  it("asks for the tracked pages, each with its keywords and top keyword, opening the page's own screen", () => {
    at("/app/search-console/site_1/tracked/pages");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": { ...LIST, rows: [PAGE], total: 1 },
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    render(<SearchConsoleTrackedPagesPage />);
    expect(askedOf("searchConsoleListPage").at(-1)).toMatchObject({ dimension: "page", view: "tracked" });
    expect(screen.getByText(/searchConsole\.track\.count 6 100/)).toBeInTheDocument();
    const row = screen.getByRole("link", { name: "/ai-agency/" });
    expect(row.getAttribute("href")).toContain("/app/search-console/site_1/pages/page?");
    expect(screen.getByText("481")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /searchConsole\.table\.topKeyword/ })).toBeInTheDocument();
    expect(screen.getByText("118")).toBeInTheDocument();
  });

  it("says so when no page is tracked", () => {
    at("/app/search-console/site_1/tracked/pages");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": { ...LIST, rows: [], total: 0, pages: 0, summary: null },
      "searchConsoleTracking:searchConsoleTracking": { ...TRACKING, pages: { count: 0, limit: 100 } },
    });
    render(<SearchConsoleTrackedPagesPage />);
    expect(screen.getByText("searchConsole.tracked.pages.empty")).toBeInTheDocument();
  });
});
