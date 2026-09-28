import { cleanup, fireEvent, renderWithProviders as render, screen, waitFor } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import SearchConsolePage from "./page";
import SearchConsolePerformancePage from "./[siteId]/page";
import SearchConsoleSearchesPage from "./[siteId]/searches/page";
import SearchConsoleConnectionPage from "./[siteId]/connection/page";

const nav = vi.hoisted(() => ({ pathname: "/app/search-console/site_1", search: "", replace: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      return Object.assign(t, { rich: t });
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
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

const CONNECTION = {
  status: "CONNECTED",
  signingIn: false,
  googleAccount: "owner@acme-shop.test",
  property: "sc-domain:acme-shop.test",
  permission: "siteOwner",
  choices: [],
  connectedAt: Date.parse("2026-09-27T10:00:00Z"),
  disconnectedAt: null,
  newestDay: "2026-09-26",
  oldestDay: "2025-05-26",
  historyDone: true,
  clearing: false,
  lastCollectedAt: Date.parse("2026-09-27T10:02:00Z"),
  problem: null,
  attempt: null,
};

function status(overrides: Record<string, unknown> = {}, connection: Record<string, unknown> | null = {}) {
  return {
    configured: true,
    owned: true,
    canManage: true,
    host: "acme-shop.test",
    ownSites: [{ siteId: "site_1", host: "acme-shop.test" }],
    historyFrom: "2025-05-26",
    connection: connection === null ? null : { ...CONNECTION, ...connection },
    ...overrides,
  };
}

const FIGURES = { clicks: 1284, impressions: 61920, ctr: 1284 / 61920, position: 21.4 };

const mutations = { begin: vi.fn(), choose: vi.fn(), disconnect: vi.fn(), ensure: vi.fn() };

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
    const name = convexPath(reference);
    if (name.endsWith("beginSearchConsoleConnect")) return mutations.begin;
    if (name.endsWith("chooseSearchConsoleProperty")) return mutations.choose;
    if (name.endsWith("disconnectSearchConsole")) return mutations.disconnect;
    if (name.endsWith("ensureSearchConsoleCopy")) return mutations.ensure;
    return vi.fn();
  }) as never);
}

/** Each test its own page, so the address writes of one never reach the next. */
let pageNumber = 0;
function at(path: string, search = "") {
  pageNumber += 1;
  nav.pathname = `${path}${path.endsWith("/") ? "" : "/"}#${pageNumber}`.replace("/#", "#");
  nav.search = search;
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  vi.mocked(useMutation).mockReset();
  nav.replace.mockClear();
  nav.push.mockClear();
  for (const fn of Object.values(mutations)) fn.mockReset().mockResolvedValue(null);
});
afterEach(cleanup);

describe("the Search Console section", () => {
  it("lists the company's own websites, each with its connection and last thirty days", () => {
    at("/app/search-console");
    answer({
      "searchConsoleReads:listSearchConsoleSites": [
        { siteId: "site_1", host: "acme-shop.test", status: "CONNECTED", figures: FIGURES, from: "2026-08-28", to: "2026-09-26", lastCollectedAt: CONNECTION.lastCollectedAt },
        { siteId: "site_2", host: "acme-blog.test", status: "NOT_CONNECTED", figures: null, from: null, to: null, lastCollectedAt: null },
      ],
    });
    render(<SearchConsolePage />);
    expect(screen.getByText("acme-shop.test")).toBeInTheDocument();
    expect(screen.getByText("searchConsole.status.CONNECTED")).toBeInTheDocument();
    expect(screen.getByText("searchConsole.status.NOT_CONNECTED")).toBeInTheDocument();
    expect(screen.getByText("1,284")).toBeInTheDocument();
    fireEvent.click(screen.getByText("acme-shop.test"));
    expect(nav.push).toHaveBeenCalledWith("/app/search-console/site_1");
  });
});

describe("a website not connected", () => {
  it("offers an admin the way to connect", async () => {
    at("/app/search-console/site_1");
    mutations.begin.mockResolvedValue({ authorizeUrl: "https://dev.convex.site/api/search-console/oauth/authorize?state=abc" });
    answer({ "searchConsoleConnect:searchConsoleStatus": status({}, null) });
    render(<SearchConsolePerformancePage />);
    const connect = screen.getByRole("button", { name: "searchConsole.connect.button" });
    fireEvent.click(connect);
    await waitFor(() => expect(mutations.begin).toHaveBeenCalledWith({ siteId: "site_1" }));
  });

  it("tells anyone else to ask an admin, and says so when Search Console is not set up", () => {
    at("/app/search-console/site_1");
    answer({ "searchConsoleConnect:searchConsoleStatus": status({ canManage: false }, null) });
    const { unmount } = render(<SearchConsolePerformancePage />);
    expect(screen.getByText("searchConsole.connect.askAdmin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "searchConsole.connect.button" })).not.toBeInTheDocument();
    unmount();

    answer({ "searchConsoleConnect:searchConsoleStatus": status({ configured: false }, null) });
    render(<SearchConsolePerformancePage />);
    expect(screen.getByText("searchConsole.connect.notSetUpTitle")).toBeInTheDocument();
  });
});

describe("Performance", () => {
  it("shows the four figures against the days before, and how many clicks Google names", () => {
    at("/app/search-console/site_1");
    answer({
      "searchConsoleConnect:searchConsoleStatus": status(),
      "searchConsoleReads:searchConsolePerformance": {
        days: [{ day: "2026-09-26", clicks: 40, impressions: 2000, ctr: 0.02, position: 21 }],
        totals: FIGURES,
        previous: { clicks: 1178, impressions: 59540, ctr: 1178 / 59540, position: 22.6 },
        named: 1041,
      },
    });
    render(<SearchConsolePerformancePage />);
    expect(screen.getByText("1,284")).toBeInTheDocument();
    expect(screen.getByText("61,920")).toBeInTheDocument();
    expect(screen.getByText(/searchConsole\.figures\.up 9\.0% 30/)).toBeInTheDocument();
    expect(screen.getByText("searchConsole.named 1,041 1,284 243")).toBeInTheDocument();
    expect(screen.getByText("searchConsole.chart.title")).toBeInTheDocument();
    // A quick pick ends on Google's newest day, not today.
    const asked = vi.mocked(useQuery).mock.calls.filter(([reference]) => convexPath(reference).endsWith("searchConsolePerformance")).at(-1)?.[1];
    expect(asked).toMatchObject({ searchType: "web", from: "2026-08-28", to: "2026-09-26" });
  });
});

describe("Searches", () => {
  const LIST = {
    rows: [
      { key: "plumber leeds", clicks: 8, impressions: 100, ctr: 0.08, position: 3, previousClicks: 2, change: 6, share: 0.6 },
      { key: "emergency plumber", clicks: 3, impressions: 100, ctr: 0.03, position: 6, previousClicks: null, change: 3, share: 0.25 },
    ],
    total: 2, page: 1, pages: 1, size: 25, cut: null, preparing: false, current: true, named: 11, comparable: true,
  };

  it("reads the list a page at a time, ordered by the heading pressed, each search opening its own screen", () => {
    at("/app/search-console/site_1/searches");
    answer({
      "searchConsoleConnect:searchConsoleStatus": status(),
      "searchConsoleCopies:searchConsoleListPage": LIST,
      "searchConsoleCopies:searchConsoleCopyStatus": { held: true, exists: true, current: true },
    });
    render(<SearchConsoleSearchesPage />);
    expect(screen.getByText("plumber leeds")).toBeInTheDocument();
    expect(screen.getByText("searchConsole.table.new")).toBeInTheDocument();
    const asked = vi.mocked(useQuery).mock.calls.filter(([reference]) => convexPath(reference).endsWith("searchConsoleListPage")).at(-1)?.[1];
    expect(asked).toMatchObject({ dimension: "query", sort: "clicks", direction: "desc", page: 1, rows: 25 });

    fireEvent.click(screen.getByRole("button", { name: /searchConsole\.table\.position/ }));
    expect(new URLSearchParams(String(nav.replace.mock.calls.at(-1)?.[0]).split("?")[1]).get("sort")).toBe("position");
    expect(mutations.ensure).not.toHaveBeenCalled();
  });

  it("asks for a list not worked out yet, and says it is on its way", async () => {
    at("/app/search-console/site_1/searches");
    answer({
      "searchConsoleConnect:searchConsoleStatus": status(),
      "searchConsoleCopies:searchConsoleCopyStatus": { held: true, exists: false, current: false },
    });
    render(<SearchConsoleSearchesPage />);
    expect(screen.getByText("searchConsole.table.preparing")).toBeInTheDocument();
    await waitFor(() => expect(mutations.ensure).toHaveBeenCalledWith({
      siteId: "site_1", searchType: "web", dimension: "query", from: "2026-08-28", to: "2026-09-26",
    }));
  });
});

describe("the connection", () => {
  it("has the admin choose among the account's properties for the website", async () => {
    at("/app/search-console/site_1/connection");
    answer({
      "searchConsoleConnect:searchConsoleStatus": status({}, {
        status: "CHOOSING",
        property: null,
        newestDay: null,
        choices: [
          { property: "https://www.acme-shop.test/", permission: "siteFullUser" },
          { property: "https://acme-shop.test/blog/", permission: "siteOwner" },
        ],
      }),
    });
    render(<SearchConsoleConnectionPage />);
    fireEvent.click(screen.getByLabelText(/https:\/\/acme-shop\.test\/blog\//));
    fireEvent.click(screen.getByRole("button", { name: "searchConsole.connection.use" }));
    await waitFor(() => expect(mutations.choose).toHaveBeenCalledWith({ siteId: "site_1", property: "https://acme-shop.test/blog/" }));
  });

  it("asks on the screen before disconnecting, never in a pop-up", async () => {
    at("/app/search-console/site_1/connection");
    answer({ "searchConsoleConnect:searchConsoleStatus": status() });
    render(<SearchConsoleConnectionPage />);
    expect(screen.getByText("sc-domain:acme-shop.test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "searchConsole.connection.disconnect" }));
    expect(screen.getByText("searchConsole.connection.confirm")).toBeInTheDocument();
    expect(mutations.disconnect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "searchConsole.connection.confirmDisconnect" }));
    await waitFor(() => expect(mutations.disconnect).toHaveBeenCalledWith({ siteId: "site_1" }));
  });

  it("says why the last sign-in did not connect, with the account it was tried with", () => {
    at("/app/search-console/site_1/connection");
    answer({
      "searchConsoleConnect:searchConsoleStatus": status({}, {
        status: "CONNECTING",
        property: null,
        newestDay: null,
        attempt: { outcome: "NO_PROPERTY", account: "someone@gmail.test", at: Date.now() },
      }),
    });
    render(<SearchConsoleConnectionPage />);
    expect(screen.getByText("searchConsole.connection.attemptTitle.NO_PROPERTY acme-shop.test someone@gmail.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "searchConsole.connect.button" })).toBeInTheDocument();
  });
});
