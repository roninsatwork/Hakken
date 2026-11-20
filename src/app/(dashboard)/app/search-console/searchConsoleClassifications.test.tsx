import { cleanup, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScreenDay } from "@/src/test/realTime";
import { useQuery } from "convex/react";

import { convexPath } from "@/src/test/siteViewFixtures";
import SearchConsolePagesPage from "./[siteId]/pages/page";
import { STARTING_CONSOLE_LIMITS } from "@/src/test/searchConsoleLimits";

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
 * its classification's own name — or Not sorted — and the filter offers
 * them. Without any, every screen reads as before. (By page classification and
 * Real against estimated, which added pages up by classification and named it
 * in a column, were taken out on 2026-11-20.)
 */

const STATUS = {
  configured: true, owned: true, canManage: true, host: "acme-shop.test", ownSites: [{ siteId: "site_1", host: "acme-shop.test" }], historyFrom: "2025-05-26", limits: STARTING_CONSOLE_LIMITS,
  connection: {
    status: "CONNECTED", signingIn: false, googleAccount: "owner@acme-shop.test", property: "sc-domain:acme-shop.test", permission: "siteOwner", choices: [],
    connectedAt: 0, disconnectedAt: null, newestDay: "2026-09-26", oldestDay: "2025-05-26", countriesNewest: [], historyDone: true, clearing: false, lastCollectedAt: 0, problem: null, attempt: null,
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
  // A fixed day, the one after the fixtures' newest: the screens' calendar periods count from today (AGENTS.md, "A test whose rows carry fixed days runs on a fixed day").
  useScreenDay("2026-09-27");
  vi.mocked(useQuery).mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the Pages filter", () => {
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
});
