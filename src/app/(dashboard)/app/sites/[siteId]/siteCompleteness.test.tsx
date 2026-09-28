import { renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import SiteKeywordsPage from "./keywords/page";
import SiteNewLostPage from "./keywords/new-lost/page";
import SiteStructurePage from "./keywords/structure/page";
import SitePositionBandsPage from "./keywords/bands/page";

/**
 * Every number whole, or saying which part it is (docs/plans/active/
 * sites-data-completeness-plan.md): on a site whose keyword list holds only
 * part of what it ranks for, the screens lead with the whole site's figures,
 * say how much of it the list is, and never call a search that left the list
 * lost.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/sites/site_1", search: "", replace: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
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
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const bands = { p01_03: 249, p04_10: 163, p11_20: 120, p21_50: 300, p51_up: 1_025 };

/** chilliapple.co.uk as the audit found it: 629 of the 1,857 searches it ranks for held. */
const PART_HELD = {
  searches: { held: 629, total: 1_857 },
  visits: { held: 900, total: 1_000 },
  whole: false,
  bands,
  moves: { fresh: 35, up: 210, down: 180, lost: 44 },
  features: { ai_overview_reference: 40, featured_snippet: 3, local_pack: null },
};

const SITE = { siteId: "site_1", host: "chilliapple.co.uk", relationship: "TRACKED", holds: [], rivals: [], checkDays: ["2026-09-23", "2026-09-20"], counts: {}, coverage: PART_HELD };

let pageNumber = 0;
function openAt(pathname: string, search: string, answers: Record<string, unknown>) {
  pageNumber += 1;
  nav.pathname = `${pathname}-${pageNumber}`;
  nav.search = search;
  nav.replace.mockClear();
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:getMySite": SITE, ...answers }));
}

const page = (rows: unknown[], total: number) => ({ rows, total, pages: 1, page: 1, size: 25, cut: null, preparing: false });

describe("a site whose list holds only part of what it ranks for", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  it("Keywords says how much of the site the list is, and a band chosen alone how many of every such search are held", () => {
    openAt("/app/sites/site_1/keywords", "band=p01_03", { "siteKeywords:listKeywords": page([], 180), "siteCharts:siteSeries": [] });
    render(<SiteKeywordsPage />);

    expect(screen.getByText("sites.coverage.part 629 1,857")).toBeInTheDocument();
    expect(screen.getByText(/sites.keywords.bandOfEvery 180 249/)).toBeInTheDocument();
  });

  it("Keywords' compare column never says a search not checked that day was out of the top 100", () => {
    const row = { _id: "k1", keyword: "web design", position: 4, change: 0, volume: 90, cpc: null, traffic: 3, page: "/", day: "2026-09-23", status: "SAME", intent: "OTHER" };
    openAt("/app/sites/site_1/keywords", "compare=2026-09-20", {
      "siteKeywords:listKeywords": page([row], 1),
      "siteKeywords:keywordsOnDay": [{ keyword: "web design", position: null, url: null, checked: false, comparable: false }],
      "siteCharts:siteSeries": [],
    });
    render(<SiteKeywordsPage />);

    expect(screen.getByText("sites.keywords.notInListThatDay")).toBeInTheDocument();
    expect(screen.queryByText("sites.common.notOnPageOne")).toBeNull();
  });

  it("New and lost counts what left the list, never lost, beside the moves across every search", () => {
    const check = {
      day: "2026-09-23", kind: "WHOLE", complete: false, checked: 629, held: 629,
      rankedNew: 12, rankedUp: 40, rankedDown: 30, rankedLost: 0, rankedLeft: 9,
    };
    openAt("/app/sites/site_1/keywords/new-lost", "", {
      "siteChecks:siteChecks": { steps: [{ ...check, lastDay: check.day, checks: 1, start: null }], newest: check },
      "siteKeywords:listMoves": page([], 0),
    });
    render(<SiteNewLostPage />);

    // The list kept, not the whole list.
    expect(screen.getAllByText(/sites.newLost.kinds.KEPT/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/sites.newLost.kinds.WHOLE/)).toBeNull();
    // Its fourth move is what left it.
    expect(screen.getByRole("tab", { name: /sites.newLost.tabNames.LEFT/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /sites.newLost.tabNames.LOST/ })).toBeNull();
    expect(screen.getByText(/sites.newLost.amongHeld 629/).textContent).toContain("sites.newLost.everySearch 35 210 180 44");
  });

  it("Position bands never calls a search new to the list a move into a band", () => {
    const listBands = { p01_03: 950, p04_10: 100, p11_20: 20, p21_50: 10, p51_up: 3 };
    openAt("/app/sites/site_1/keywords/bands", "", {
      "siteCharts:siteSeries": [{ websiteId: "website_1", host: "a.com", isYou: true, before: null, points: [
        { day: "2026-09-27", lastDay: "2026-09-27", rankedUp: 0, rankedDown: 0, rankedNew: 0, rankedLost: 0, ai: [], keywords: 1_083, bands: listBands, allBands: bands },
      ] }],
      "siteBands:bandMoves": {
        rankingDay: "2026-09-27", previousDay: "2026-09-25", start: null, bands: listBands,
        moves: [{ from: "none", to: "p01_03", count: 200 }, { from: "none", to: "p51_up", count: 37 }],
        closest: { rows: [], total: 0 },
      },
      "siteBands:listBandMoves": { rows: [], cut: null, day: "2026-09-27" },
    });
    render(<SitePositionBandsPage />);

    expect(screen.getByText(/sites.bands.moves.someHeld/).textContent).toContain("237 237 950");
    expect(screen.queryByText(/sites.bands.moves.someChanged/)).toBeNull();
    expect(screen.getAllByText(/sites.bands.moves.newToList/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/sites.bands.moves.notRanking/)).toBeNull();
  });

  it("Site structure's shares are of the whole site, with the rest named", () => {
    const section = (name: string, keywords: number, traffic: number) => ({ section: name, pages: 2, keywords, top3: 1, traffic, day: "2026-09-23" });
    openAt("/app/sites/site_1/keywords/structure", "", {
      "siteKeywords:listSections": { rows: [section("/", 400, 600), section("/blog/", 229, 300)], cut: null },
    });
    render(<SiteStructurePage />);

    // 629 of 1,857 searches and 900 of 1,000 visits: 34% and 90%.
    expect(screen.getByText("sites.structure.outside 34% 90%")).toBeInTheDocument();
    expect(screen.getByText(/sites.structure.summaryHeld/)).toBeInTheDocument();
  });
});
