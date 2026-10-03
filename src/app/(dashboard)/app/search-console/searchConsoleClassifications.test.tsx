import { cleanup, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { convexPath } from "@/src/test/siteViewFixtures";
import SearchConsolePagesPage from "./[siteId]/pages/page";
import SearchConsoleEstimatesPage from "./[siteId]/real-against-estimated/page";
import SearchConsoleTypesPage from "./[siteId]/types/page";

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

/**
 * A website's own classifications on Search Console's screens (docs/plans/
 * active/page-groups-plan.md, decision 2): once it has any, a page's kind is
 * its classification's own name — or Not sorted — the filter offers them,
 * and Types adds its page figures up by the classifications' type. Without
 * any, every screen reads as before.
 */

const STATUS = {
  configured: true, owned: true, canManage: true, host: "acme-shop.test", ownSites: [{ siteId: "site_1", host: "acme-shop.test" }], historyFrom: "2025-05-26",
  connection: {
    status: "CONNECTED", signingIn: false, googleAccount: "owner@acme-shop.test", property: "sc-domain:acme-shop.test", permission: "siteOwner", choices: [],
    connectedAt: 0, disconnectedAt: null, newestDay: "2026-09-26", oldestDay: "2025-05-26", historyDone: true, clearing: false, lastCollectedAt: 0, problem: null, attempt: null,
  },
};

const CHOICES = [
  { id: "class_hub", name: "Content hub", type: "INFORMATIONAL" },
  { id: "class_journal", name: "Journal", type: "INFORMATIONAL" },
  { id: "class_services", name: "Plumbing services", type: "SERVICE" },
];

const BLANK = {
  rows: 0, of: 0, impressions: 0, previousClicks: null, position: null, tracked: 0, gaining: 0, losing: 0, gained: 0, lost: 0, volume: 0, estimate: 0, expected: 0,
  high: 0, low: 0, pagesInvolved: null, pagesShown: null, bands: { "1-3": 0, "4-10": 0, "11-20": 0, "21-50": 0, "51+": 0 }, bandsBefore: null, brand: null,
};

const ROW = {
  impressions: 400, ctr: 0.1, position: 4, band: "4-10", previousClicks: null, change: null, previousPosition: null, positionChange: null, share: 0.5,
  count: 1, top: "plumber", tracked: false, volume: null, brand: null, usualCtr: null, expected: null, topShare: null, next: null, nextShare: null,
};

function list(rows: Array<Record<string, unknown>>, summary: Record<string, unknown>) {
  return {
    rows, total: rows.length, page: 1, pages: 1, size: 25, cut: null, preparing: false, current: true, named: 100, listed: rows.length, comparable: false,
    live: false, from: "2026-09-20", to: "2026-09-26", summary: { ...BLANK, ...summary },
  };
}

/** Answers by function, with the keyword and page lists told apart. */
function answer(answers: { choices: unknown; pages: unknown; keywords?: unknown }) {
  vi.mocked(useQuery).mockImplementation(((reference: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    const name = convexPath(reference);
    if (name.endsWith("searchConsoleStatus")) return STATUS;
    if (name.endsWith("pageKindChoices")) return answers.choices;
    if (name.endsWith("searchConsoleListPage")) return (args as { dimension: string }).dimension === "query" ? (answers.keywords ?? list([], { clicks: 0, kinds: [], types: [] })) : answers.pages;
    return undefined;
  }) as never);
}

let pageNumber = 0;
function at(path: string, search = "") {
  pageNumber += 1;
  nav.pathname = `${path}#${pageNumber}`;
  nav.search = search;
}

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
});
afterEach(cleanup);

describe("Types", () => {
  it("without classifications: pages by kind, and clicks from articles and service pages", () => {
    at("/app/search-console/site_1/types");
    answer({
      choices: null,
      pages: list([], { clicks: 100, kinds: [{ kind: "ARTICLE", rows: 3, clicks: 60 }, { kind: "SERVICE", rows: 1, clicks: 30 }], types: [] }),
    });
    render(<SearchConsoleTypesPage />);
    expect(screen.getByText("searchConsole.types.pagesTitle")).toBeInTheDocument();
    expect(screen.getByText("searchConsole.types.fromArticles")).toBeInTheDocument();
    expect(screen.getByText("sites.common.pageTypes.ARTICLE")).toBeInTheDocument();
    expect(screen.queryByText("searchConsole.types.fromInformational")).not.toBeInTheDocument();
  });

  it("with classifications: pages by classification, Not sorted among them, and the page figures by type", () => {
    at("/app/search-console/site_1/types");
    answer({
      choices: CHOICES,
      pages: list([], {
        clicks: 100,
        kinds: [{ kind: "class_hub", rows: 2, clicks: 40 }, { kind: "class_journal", rows: 1, clicks: 20 }, { kind: "class_services", rows: 1, clicks: 30 }, { kind: "NOT_SORTED", rows: 1, clicks: 10 }],
        types: [{ type: "INFORMATIONAL", rows: 3, clicks: 60 }, { type: "SERVICE", rows: 1, clicks: 30 }],
      }),
    });
    render(<SearchConsoleTypesPage />);
    expect(screen.getByText("searchConsole.types.pagesTitleClassified")).toBeInTheDocument();
    expect(screen.queryByText("searchConsole.types.pagesTitle")).not.toBeInTheDocument();
    // The company's own names, and Not sorted in words — never an automatic kind.
    for (const name of ["Content hub", "Journal", "Plumbing services", "sites.common.notSorted"]) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    expect(screen.queryByText(/sites\.common\.pageTypes\./)).not.toBeInTheDocument();
    // The two page figures, fed by type: Content hub and Journal are both informational content.
    const informational = screen.getByText("searchConsole.types.fromInformational").closest("div")?.parentElement as HTMLElement;
    expect(within(informational).getByText("60")).toBeInTheDocument();
    const services = screen.getByText("searchConsole.types.fromServices").closest("div")?.parentElement as HTMLElement;
    expect(within(services).getByText("30")).toBeInTheDocument();
    // Each opens its pages.
    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "");
    expect(links.some((href) => href.includes("/pages") && href.includes("kind=class_hub"))).toBe(true);
    expect(links.some((href) => href.includes("/pages") && href.includes("kind=NOT_SORTED"))).toBe(true);
  });
});

describe("the Pages filter and the type column", () => {
  const optionsOf = (label: string) => within(screen.getByRole("combobox", { name: label })).getAllByRole("option").map((option) => option.textContent);

  it("offers Hakken's page types while the website has no classifications", () => {
    at("/app/search-console/site_1/pages");
    answer({ choices: null, pages: list([], { clicks: 0, kinds: [], types: [] }) });
    render(<SearchConsolePagesPage />);
    const options = optionsOf("searchConsole.filters.pageType");
    expect(options[0]).toBe("searchConsole.filters.anyPageType");
    expect(options).toContain("sites.common.pageTypes.ARTICLE");
  });

  it("offers the classifications and Not sorted once it has any", () => {
    at("/app/search-console/site_1/pages");
    answer({ choices: CHOICES, pages: list([], { clicks: 0, kinds: [], types: [] }) });
    render(<SearchConsolePagesPage />);
    expect(optionsOf("sites.common.classification")).toEqual(["sites.common.anyClassification", "Content hub", "Journal", "Plumbing services", "sites.common.notSorted"]);
  });

  it("names a page's classification in Real against estimated, under a Classification heading", () => {
    at("/app/search-console/site_1/real-against-estimated");
    const rows = [
      { ...ROW, key: "https://acme-shop.test/hub/boilers/", clicks: 40, kind: "class_hub", estimate: 90, gap: 50, verdict: "high" },
      { ...ROW, key: "https://acme-shop.test/contact/", clicks: 10, kind: "NOT_SORTED", estimate: 10, gap: 0, verdict: "close" },
    ];
    answer({ choices: CHOICES, pages: list(rows, { clicks: 50, kinds: [], types: [] }) });
    render(<SearchConsoleEstimatesPage />);
    expect(screen.getByRole("columnheader", { name: "sites.common.classification" })).toBeInTheDocument();
    expect(screen.getAllByText("Content hub").length).toBeGreaterThan(0);
    expect(screen.getAllByText("sites.common.notSorted").length).toBeGreaterThan(0);
  });

  it("keeps the Type heading and Hakken's words without classifications", () => {
    at("/app/search-console/site_1/real-against-estimated");
    const rows = [{ ...ROW, key: "https://acme-shop.test/hub/boilers/", clicks: 40, kind: "ARTICLE", estimate: 90, gap: 50, verdict: "high" }];
    answer({ choices: null, pages: list(rows, { clicks: 40, kinds: [], types: [] }) });
    render(<SearchConsoleEstimatesPage />);
    expect(screen.getByRole("columnheader", { name: "searchConsole.table.type" })).toBeInTheDocument();
    expect(screen.getAllByText("sites.common.pageTypes.ARTICLE").length).toBeGreaterThan(0);
  });
});
