import { renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { OverviewSections } from "./OverviewSections";
import SitePagesPage from "./keywords/pages/page";

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1/keywords/pages", search: "", replace: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return {
    ...base,
    useTranslations: (namespace: string) => {
      const t = (key: string, values?: Record<string, unknown>) => [`${namespace}.${key}`, ...Object.values(values ?? {})].join(" ");
      return Object.assign(t, { rich: t, has: () => true });
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

/**
 * A website's own classifications on its Sites screens (docs/plans/active/
 * page-groups-plan.md, decision 2): Top pages' Type column and filter, and
 * the Overview's pages by kind, follow them once the website has any — each
 * classification by its own name, and Not sorted. Without any, as before.
 */

const SITE = { host: "acme-shop.test", siteId: "site_1", holds: [], checkDays: ["2026-09-26"], counts: {} };
const CHOICES = [
  { id: "class_hub", name: "Content hub", type: "INFORMATIONAL" },
  { id: "class_services", name: "Plumbing services", type: "SERVICE" },
];

const PAGE = {
  url: "https://acme-shop.test/", section: "/", keywords: 4, bestPosition: 3, top3: 1, volumeSum: 400, topKeyword: "plumber", topKeywordVolume: 100,
  firstSeenDay: "2026-09-01", day: "2026-09-26", aiEngines: [], aiTimes: 0, traffic: 40, trafficValue: null, pageRank: null, referringDomains: 2, backlinks: 3,
};

function pages(rows: Array<{ page: string; pageType: string; kind: string }>) {
  return { rows: rows.map((row, index) => ({ ...PAGE, _id: `page_${index}`, ...row })), total: rows.length, page: 1, pages: 1, size: 25, cut: null };
}

let pageNumber = 0;
function openAt(answers: Record<string, unknown>) {
  pageNumber += 1;
  nav.pathname = `/app/sites/site_1/keywords/pages-${pageNumber}`;
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:getMySite": SITE, ...answers }));
}

const optionsOf = (label: string) => within(screen.getByRole("combobox", { name: label })).getAllByRole("option").map((option) => option.textContent);

beforeEach(() => {
  vi.mocked(useQuery).mockReset();
  window.localStorage.clear();
});

describe("Top pages", () => {
  it("shows Hakken's page types, and filters by them, while the website has no classifications", () => {
    openAt({ "pageKinds:pageKindChoices": null, "siteKeywords:listPages": pages([{ page: "/hub/boilers/", pageType: "ARTICLE", kind: "ARTICLE" }]) });
    render(<SitePagesPage />);
    expect(screen.getByRole("columnheader", { name: "sites.pages.columns.type" })).toBeInTheDocument();
    expect(screen.getAllByText("sites.common.pageTypes.ARTICLE").length).toBeGreaterThan(0);
    expect(optionsOf("sites.pages.typeFilter")[0]).toBe("sites.pages.anyType");
  });

  it("shows each page's classification by name, Not sorted in words, and filters by them", () => {
    openAt({
      "pageKinds:pageKindChoices": CHOICES,
      "siteKeywords:listPages": pages([
        { page: "/hub/boilers/", pageType: "ARTICLE", kind: "class_hub" },
        { page: "/contact/", pageType: "CONTACT", kind: "NOT_SORTED" },
      ]),
    });
    render(<SitePagesPage />);
    expect(screen.getByRole("columnheader", { name: "sites.common.classification" })).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Content hub")).toBeInTheDocument();
    expect(within(table).getByText("sites.common.notSorted")).toBeInTheDocument();
    expect(within(table).queryByText("sites.common.pageTypes.ARTICLE")).not.toBeInTheDocument();
    expect(optionsOf("sites.common.classification")).toEqual(["sites.common.anyClassification", "Content hub", "Plumbing services", "sites.common.notSorted"]);
  });
});

describe("the Overview's pages by kind", () => {
  const extras = (pagesPart: Record<string, unknown>) => ({
    homePageRank: null, aiOverviewPages: 0, aiOverviewCapped: false, assistants: [],
    pages: { total: 3, visits: 600, capped: false, visitBands: [], ...pagesPart },
    competitors: { found: 0, read: 0, readOf: null, you: { keywords: null, visits: null }, rivals: [] },
  }) as unknown as Parameters<typeof OverviewSections>[0]["extras"];

  it("reads by kind without classifications", () => {
    openAt({ "pageKinds:pageKindChoices": null });
    render(<OverviewSections latest={null} extras={extras({ kinds: [{ pageType: "ARTICLE", pages: 2, visits: 500 }], classified: null })} />);
    expect(screen.getByText("sites.overview.pageKinds.title")).toBeInTheDocument();
    expect(screen.getByText("sites.common.pageTypes.ARTICLE")).toBeInTheDocument();
  });

  it("becomes pages by classification: a bar for each, and one for Not sorted, each opening its pages", () => {
    openAt({ "pageKinds:pageKindChoices": CHOICES });
    render(<OverviewSections latest={null} extras={extras({
      kinds: [{ pageType: "ARTICLE", pages: 2, visits: 500 }],
      classified: [{ kind: "class_hub", pages: 2, visits: 500 }, { kind: "NOT_SORTED", pages: 1, visits: 100 }],
    })} />);
    expect(screen.getByText("sites.overview.pageKinds.titleClassified")).toBeInTheDocument();
    const hub = screen.getByRole("link", { name: "Content hub" });
    expect(hub.getAttribute("href")).toContain("type=class_hub");
    expect(screen.getByRole("link", { name: "sites.common.notSorted" }).getAttribute("href")).toContain("type=NOT_SORTED");
    expect(screen.queryByText("sites.common.pageTypes.ARTICLE")).not.toBeInTheDocument();
  });
});
