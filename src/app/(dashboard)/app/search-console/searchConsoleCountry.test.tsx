import { cleanup, fireEvent, renderWithProviders as render, screen, waitFor } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import { SearchConsoleCountryPicker } from "./_components/SearchConsoleCountryPicker";
import SearchConsoleSiteLayout from "./[siteId]/layout";
import SearchConsolePerformancePage from "./[siteId]/page";
import SearchConsoleKeywordsPage from "./[siteId]/keywords/page";
import SearchConsolePagesPage from "./[siteId]/pages/page";
import SearchConsoleKeywordPage from "./[siteId]/keywords/keyword/page";
import SearchConsoleNewLostPage from "./[siteId]/new-and-lost/page";
import SearchConsoleBandsPage from "./[siteId]/position-bands/page";
import SearchConsolePlacesPage from "./[siteId]/countries-and-devices/page";

/**
 * The country choice beside the date boxes (docs/plans/active/
 * search-console-plan.md §16): every page reads the country chosen — a
 * country kept ready from what is kept, any other asked of Google — and the
 * tables have no Country filter of their own any more.
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

const STATUS = {
  configured: true,
  owned: true,
  canManage: true,
  host: "acme-shop.test",
  ownSites: [{ siteId: "site_1", host: "acme-shop.test" }],
  historyFrom: "2025-05-26",
  connection: CONNECTION,
};

const FIGURES = { clicks: 1284, impressions: 61920, ctr: 1284 / 61920, position: 21.4 };
const PERFORMANCE = { days: [{ day: "2026-09-26", clicks: 40, impressions: 2000, ctr: 0.02, position: 21 }], totals: FIGURES, previous: null, named: null, live: false };

const ROW = {
  key: "plumber leeds", clicks: 8, impressions: 100, ctr: 0.08, position: 3, previousClicks: 2, change: 6, share: 0.6,
  band: "1-3", previousPosition: null, positionChange: null, count: 2, top: "https://acme-shop.test/plumbers/", tracked: false,
  kind: null, volume: null, estimate: null, brand: false, usualCtr: null, expected: null, topShare: null, next: null, nextShare: null, verdict: null, gap: null,
};
const SUMMARY = {
  rows: 1, of: 1, clicks: 8, impressions: 100, tracked: 0, gaining: 1, losing: 0, gained: 6, lost: 0, volume: 0, estimate: 0, expected: 0,
  high: 0, low: 0, pagesInvolved: null, pagesShown: null, bands: { "1-3": 1, "4-10": 0, "11-20": 0, "21-50": 0, "51+": 0 }, bandsBefore: null, brand: null, kinds: [],
};
const LIST = {
  rows: [ROW], total: 1, page: 1, pages: 1, size: 25, cut: null, preparing: false, current: true, named: 8, listed: 1, comparable: true,
  live: false, from: "2026-08-28", to: "2026-09-26", summary: SUMMARY,
};
const TRACKING = { keywords: { count: 0, limit: 200 }, pages: { count: 0, limit: 100 } };

/** The actions a test answers, by the end of their name; any other is kept here by its whole name when first used, and never answers. */
let actions: Record<string, ReturnType<typeof vi.fn>> = {};

function answer(queries: Record<string, unknown>) {
  vi.mocked(useQuery).mockImplementation(answerQueries(queries));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation(((reference: unknown) => {
    const name = convexPath(reference);
    const match = Object.keys(actions).find((suffix) => name.endsWith(suffix));
    if (match) return actions[match];
    actions[name] = vi.fn(() => new Promise(() => undefined));
    return actions[name];
  }) as never);
}

/** The questions put to Google live so far, by name. */
function askedOfGoogle(): string[] {
  return Object.entries(actions).filter(([name, action]) => /Live/.test(name) && action.mock.calls.length > 0).map(([name]) => name);
}

/** What a read was last asked, by the end of its name. */
function askedOf(suffix: string): Array<Record<string, unknown>> {
  return vi.mocked(useQuery).mock.calls
    .filter(([reference, args]) => convexPath(reference).endsWith(suffix) && args !== "skip")
    .map(([, args]) => args as Record<string, unknown>);
}

/** The address the page last wrote. */
function written(): URLSearchParams {
  return new URLSearchParams(String(nav.replace.mock.calls.at(-1)?.[0]).split("?")[1] ?? "");
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
  actions = {};
});
afterEach(cleanup);

describe("the country choice", () => {
  it("opens on All countries, then the website's countries kept ready in the order added, then every other country by name", () => {
    at("/app/search-console/site_1");
    answer({ "searchConsoleCountries:searchConsoleCountryChoices": { ready: ["irl", "gbr"] } });
    render(<SearchConsoleCountryPicker />);
    const select = screen.getByRole("combobox", { name: "searchConsole.country.label" }) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(select.options[0]).toHaveTextContent("searchConsole.country.all");
    const groups = [...select.querySelectorAll("optgroup")];
    expect(groups.map((group) => group.label)).toEqual(["searchConsole.country.ready", "searchConsole.country.others"]);
    expect([...groups[0].querySelectorAll("option")].map((option) => [option.value, option.textContent])).toEqual([["irl", "Ireland"], ["gbr", "United Kingdom"]]);
    const others = [...groups[1].querySelectorAll("option")];
    const names = others.map((option) => option.textContent ?? "");
    expect(names).toEqual([...names].sort(new Intl.Collator("en-GB").compare));
    const codes = others.map((option) => option.value);
    expect(codes).toEqual(expect.arrayContaining(["moz", "usa"]));
    expect(codes).not.toContain("gbr");
    expect(codes).not.toContain("irl");
    expect(codes).not.toContain("zzz");

    fireEvent.change(select, { target: { value: "moz" } });
    expect(written().get("country")).toBe("moz");
  });

  it("has no kept-ready group when the website keeps none, and All countries takes the country out of the address", () => {
    at("/app/search-console/site_1", "country=gbr");
    answer({ "searchConsoleCountries:searchConsoleCountryChoices": { ready: [] } });
    render(<SearchConsoleCountryPicker />);
    const select = screen.getByRole("combobox", { name: "searchConsole.country.label" }) as HTMLSelectElement;
    expect(select.value).toBe("gbr");
    expect([...select.querySelectorAll("optgroup")].map((group) => group.label)).toEqual(["searchConsole.country.others"]);
    fireEvent.change(select, { target: { value: "" } });
    expect(written().has("country")).toBe(false);
  });

  it("sits beside the date boxes on every page of a website, and says a country not kept ready is asked of Google", () => {
    at("/app/search-console/site_1", "country=moz");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleCountries:searchConsoleCountryChoices": { ready: ["gbr"] },
    });
    const { unmount } = render(<SearchConsoleSiteLayout><p>the page</p></SearchConsoleSiteLayout>);
    expect(screen.getByRole("combobox", { name: "searchConsole.country.label" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "sites.range.label" })).toBeInTheDocument();
    expect(screen.getByText(/searchConsole\.country\.asked/)).toBeInTheDocument();
    unmount();

    at("/app/search-console/site_1", "country=gbr");
    render(<SearchConsoleSiteLayout><p>the page</p></SearchConsoleSiteLayout>);
    expect(screen.queryByText(/searchConsole\.country\.asked/)).not.toBeInTheDocument();
  });
});

describe("a country the website keeps ready", () => {
  it("is passed to the figures and the list, read from what is kept, never asked of Google", () => {
    at("/app/search-console/site_1/keywords", "country=gbr");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleReads:searchConsolePerformance": PERFORMANCE,
      "searchConsoleLists:searchConsoleListPage": LIST,
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    render(<SearchConsoleKeywordsPage />);
    expect(screen.getByText("plumber leeds")).toBeInTheDocument();
    expect(askedOf("searchConsoleListPage").at(-1)).toMatchObject({ dimension: "query", country: "gbr", from: "2026-08-28", to: "2026-09-26" });
    expect(askedOf("searchConsolePerformance").at(-1)).toMatchObject({ country: "gbr" });
    expect(askedOfGoogle()).toEqual([]);
  });

  it("on Countries and devices narrows the devices only: the countries are every country", () => {
    at("/app/search-console/site_1/countries-and-devices", "country=gbr");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleSplitList": { rows: [], preparing: false, current: true, named: 0, listed: 0, comparable: true, live: false, from: null, to: null },
    });
    render(<SearchConsolePlacesPage />);
    const asked = askedOf("searchConsoleSplitList");
    const countries = asked.filter((args) => args.dimension === "country").at(-1);
    const devices = asked.filter((args) => args.dimension === "device").at(-1);
    expect(countries).toBeDefined();
    expect(countries).not.toHaveProperty("country");
    expect(devices).toMatchObject({ country: "gbr" });
  });
});

describe("a country the website does not keep ready", () => {
  it("asks Google for Performance's figures in that country", async () => {
    at("/app/search-console/site_1", "country=moz");
    actions = {
      searchConsoleLiveDays: vi.fn().mockResolvedValue({ ok: true, days: PERFORMANCE.days, totals: FIGURES, previous: null, named: null }),
    };
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleReads:searchConsolePerformance": { days: [], totals: null, previous: null, named: null, live: true },
    });
    render(<SearchConsolePerformancePage />);
    expect(await screen.findByText("1,284")).toBeInTheDocument();
    expect(askedOf("searchConsolePerformance").at(-1)).toMatchObject({ country: "moz" });
    expect(actions.searchConsoleLiveDays).toHaveBeenCalledWith({ siteId: "site_1", searchType: "web", from: "2026-08-28", to: "2026-09-26", country: "moz" });
  });

  it("asks Google for a list when the server says the country is not kept ready, once, whatever the search", async () => {
    at("/app/search-console/site_1/keywords", "country=moz");
    actions = {
      searchConsoleLiveDays: vi.fn().mockResolvedValue({ ok: true, days: [], totals: FIGURES, previous: null, named: null }),
      searchConsoleLiveList: vi.fn().mockResolvedValue({ ok: true, rows: [{ ...ROW, key: "plumber maputo" }], cut: null, named: 8, comparable: true, summary: SUMMARY }),
    };
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleReads:searchConsolePerformance": { days: [], totals: null, previous: null, named: null, live: true },
      "searchConsoleLists:searchConsoleListPage": { ...LIST, rows: [], total: 0, pages: 0, named: null, listed: 0, summary: null, from: null, to: null, live: true },
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
    });
    render(<SearchConsoleKeywordsPage />);
    expect(await screen.findByText("plumber maputo")).toBeInTheDocument();
    expect(actions.searchConsoleLiveList).toHaveBeenCalledWith(expect.objectContaining({ dimension: "query", country: "moz", from: "2026-08-28", to: "2026-09-26" }));
    expect(screen.getByText("searchConsole.table.asked")).toBeInTheDocument();
    await waitFor(() => expect(actions.searchConsoleLiveDays).toHaveBeenCalledWith(expect.objectContaining({ country: "moz" })));

    // A search is worked out from Google's answer: neither the server nor Google is asked again.
    fireEvent.change(screen.getByPlaceholderText("searchConsole.keywords.searchPlaceholder"), { target: { value: "maputo" } });
    await new Promise((settle) => setTimeout(settle, 500));
    expect(screen.getByText("plumber maputo")).toBeInTheDocument();
    expect(actions.searchConsoleLiveList).toHaveBeenCalledTimes(1);
    expect(askedOf("searchConsoleListPage").every((args) => !("q" in args))).toBe(true);
  });

  it("New and lost says the country isn't kept ready, in place of its figures, chart and table", () => {
    at("/app/search-console/site_1/new-and-lost", "country=moz");
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleChanges:searchConsoleNewLost": {
        rows: [], total: 0, page: 1, pages: 0, size: 25, cut: null, preparing: false,
        counts: { newKeywords: 0, lostKeywords: 0, newPages: 0, lostPages: 0 }, weeks: [], watchedFrom: null, notReady: true,
      },
    });
    render(<SearchConsoleNewLostPage />);
    expect(screen.getByText("searchConsole.country.notReady Mozambique")).toBeInTheDocument();
    expect(screen.queryByText("searchConsole.newLost.newKeywords")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(askedOf("searchConsoleNewLost").at(-1)).toMatchObject({ country: "moz" });
  });

  it("Position bands says so in place of its weekly chart, and still lists the keywords", () => {
    at("/app/search-console/site_1/position-bands", "country=moz");
    actions = {
      searchConsoleLiveList: vi.fn(() => new Promise(() => undefined)),
    };
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": { ...LIST, rows: [], live: true },
      "searchConsolePeriods:searchConsoleWeekFigures": { weeks: [], notReady: true, preparing: false },
    });
    render(<SearchConsoleBandsPage />);
    expect(screen.getByText("searchConsole.country.notReady Mozambique")).toBeInTheDocument();
    expect(screen.queryByText("searchConsole.bands.chartTitle")).not.toBeInTheDocument();
    expect(askedOf("searchConsoleWeekFigures").at(-1)).toMatchObject({ country: "moz" });
    expect(actions.searchConsoleLiveList).toHaveBeenCalledWith(expect.objectContaining({ country: "moz" }));
  });
});

describe("one country choice per page", () => {
  it("the Keywords and Pages tables have no Country filter of their own", () => {
    for (const [path, Page] of [["keywords", SearchConsoleKeywordsPage], ["pages", SearchConsolePagesPage]] as const) {
      at(`/app/search-console/site_1/${path}`);
      answer({
        "searchConsoleConnect:searchConsoleStatus": STATUS,
        "searchConsoleReads:searchConsolePerformance": PERFORMANCE,
        "searchConsoleLists:searchConsoleListPage": LIST,
        "searchConsoleTracking:searchConsoleTracking": TRACKING,
      });
      const { unmount } = render(<Page />);
      expect(screen.getByRole("combobox", { name: "searchConsole.filters.device" })).toBeInTheDocument();
      expect(screen.queryByRole("combobox", { name: /country/i })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("a keyword's own screen has no Country filter either, and asks for its days and devices in the country chosen", async () => {
    at("/app/search-console/site_1/keywords/keyword", "key=plumber+leeds&country=gbr");
    actions = {
      searchConsoleKeySeries: vi.fn().mockResolvedValue({ ok: true, days: PERFORMANCE.days, totals: FIGURES, previous: null, previousHeld: true }),
      searchConsoleKeySplits: vi.fn().mockResolvedValue({ ok: true, countries: [{ key: "gbr", clicks: 8, impressions: 100, share: 1 }], devices: [] }),
    };
    answer({
      "searchConsoleConnect:searchConsoleStatus": STATUS,
      "searchConsoleLists:searchConsoleListPage": { ...LIST, rows: [{ ...ROW, key: "https://acme-shop.test/plumbers/" }] },
      "searchConsoleTracking:searchConsoleTracking": TRACKING,
      "searchConsoleTracking:searchConsoleIsTracked": false,
    });
    render(<SearchConsoleKeywordPage />);
    expect(await screen.findByText("1,284")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "searchConsole.filters.device" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /country/i })).not.toBeInTheDocument();
    expect(actions.searchConsoleKeySeries).toHaveBeenCalledWith(expect.objectContaining({ dimension: "query", key: "plumber leeds", country: "gbr" }));
    expect(actions.searchConsoleKeySplits).toHaveBeenCalledWith(expect.objectContaining({ country: "gbr" }));
    expect(askedOf("searchConsoleListPage").at(-1)).toMatchObject({ within: { kind: "query", key: "plumber leeds" }, country: "gbr" });
  });
});
