import { fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import SiteOrganicCompetitorsPage from "./competitors/organic/page";
import SiteRivalPage from "./competitors/rival/page";
import SiteMovesPage from "./google/moves/page";
import SitePositionBandsPage from "./keywords/bands/page";
import SiteNewLostPage from "./keywords/new-lost/page";
import SitePaidPage from "./paid/page";
import SitePaidKeywordsPage from "./paid/keywords/page";
import SiteLinkSourcesPage from "./backlinks/where/page";
import SiteAnswersPage from "./ai/answers/page";
import SiteLayout from "./layout";
import SiteMentionsPage from "./ai/mentions/page";
import SiteSideBySidePage from "./competitors/page";
import { OverviewPanels } from "./OverviewPanels";
import SiteBacklinksPage from "./backlinks/page";
import SiteLinkQualityPage from "./backlinks/quality/page";
import SiteLinksNewLostPage from "./backlinks/new-lost/page";

/**
 * What the screen audit of 2026-09-26 found, fixed on the screens
 * (docs/plans/active/sites-audit-fixes-plan.md). Each test is shaped like the
 * case that found it.
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
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

const hold = (siteId: string, host: string, relationship: "OWNED" | "TRACKED", ofHost: string | null = null) => ({ siteId, host, relationship, ofHost });

/** A company with two sites of its own: a.com, with a competitor, and b.com, outside a.com's group. */
const SITE = {
  ...hold("site_1", "a.com", "OWNED"),
  holds: [hold("site_1", "a.com", "OWNED"), hold("site_rival", "rival.com", "TRACKED", "a.com"), hold("site_b", "b.com", "OWNED")],
  rivals: [hold("site_rival", "rival.com", "TRACKED", "a.com")],
  checkDays: ["2026-09-26"],
  counts: {},
};

let pageNumber = 0;
function openAt(pathname: string, search: string, answers: Record<string, unknown>) {
  pageNumber += 1;
  nav.pathname = `${pathname}?n=${pageNumber}`;
  nav.search = search;
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:getMySite": SITE, ...answers }));
}

const organic = (host: string) => ({
  host, kind: "COMPETITOR", intersections: 40, averagePosition: 8, estimatedTraffic: 900,
  domainKeywords: 1_000, domainTraffic: 5_000, tracked: true, day: "2026-09-26",
});

describe("a competitor's comparison (1.1)", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  it("opens only for the websites beside this one, not every website the company holds", () => {
    openAt("/app/sites/site_1/competitors/organic", "", {
      "siteCompetitors:listOrganicCompetitors": [organic("rival.com"), organic("b.com")],
    });
    render(<SiteOrganicCompetitorsPage />);

    expect(screen.getByRole("link", { name: "rival.com" }).getAttribute("href")).toContain("rival=site_rival");
    // The company's other own site is in the list, but compares with nothing here.
    expect(screen.getByText("b.com")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "b.com" })).toBeNull();
  });

  it("says a website outside the group is not one beside this one, and never asks for a comparison", () => {
    openAt("/app/sites/site_1/competitors/rival", "rival=site_b", {});
    render(<SiteRivalPage />);

    expect(screen.getByText("sites.rivalRecord.notFoundTitle")).toBeInTheDocument();
    const asked = vi.mocked(useQuery).mock.calls.filter(([, args]) => args !== "skip").map(([reference]) => convexPath(reference));
    expect(asked).not.toContain("siteRecords:sharedSearches");
    expect(asked).not.toContain("siteCompetitors:listRivals");
  });
});

const point = (day: string, figures: Record<string, unknown>) => ({
  day, lastDay: day, rankedUp: 0, rankedDown: 0, rankedNew: 0, rankedLost: 0, ai: [], ...figures,
});
const line = (points: unknown[]) => [{ websiteId: "website_1", host: "a.com", isYou: true, points, before: null }];

describe("moves between checks (1.3)", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  const check = (day: string, kind: string, held: number, moves: [number, number, number, number] | null) => ({
    day, lastDay: day, checks: 1, kind, checked: held, held,
    start: kind === "FIRST" || kind === "FIRST_LIST" ? kind : null,
    rankedNew: moves?.[0] ?? null, rankedUp: moves?.[1] ?? null, rankedDown: moves?.[2] ?? null, rankedLost: moves?.[3] ?? null,
  });
  const MOVES_PAGE = { rows: [], total: 0, page: 1, pages: 1, size: 25, cut: null, preparing: false };

  it("New and lost counts our own checks, marks the first one, and its newest numbers open the same moves", () => {
    const newest = check("2026-09-24", "WHOLE", 104, [5, 3, 2, 1]);
    openAt("/app/sites/site_1/keywords/new-lost", "", {
      "siteChecks:siteChecks": { steps: [check("2026-09-22", "FIRST", 100, null), newest], newest },
      "siteKeywords:listMoves": MOVES_PAGE,
    });
    render(<SiteNewLostPage />);

    // The checks table, newest first; the first check marked, with nothing counted as moves.
    const checks = screen.getAllByRole("table").at(-1) as HTMLElement;
    const rows = within(checks).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(expect.arrayContaining(["5", "3", "2", "1", "+5"]));
    expect(rows[1].textContent).toContain("sites.newLost.kinds.FIRST");
    expect(within(rows[1]).getAllByRole("cell").slice(1).map((cell) => cell.textContent)).toEqual(["–", "–", "–", "–", "–"]);

    // The tabs count the newest check, and its list is the same moves, the most searched first.
    expect(screen.getByRole("tab", { name: /sites.newLost.tabNames.UP/ }).textContent).toContain("3");
    const asked = vi.mocked(useQuery).mock.calls.filter(([reference, args]) => args !== "skip" && convexPath(reference) === "siteKeywords:listMoves");
    expect(asked.at(-1)?.[1]).toMatchObject({ status: "UP", sort: "volume" });
    fireEvent.click(screen.getByRole("tab", { name: /sites.newLost.tabNames.NEW/ }));
    expect(String(nav.replace.mock.calls.at(-1)?.[0])).toContain("direction=NEW");
  });

  it("New and lost says the whole list's first day was a start, not new rankings, and lists nothing", () => {
    const newest = check("2026-09-25", "FIRST_LIST", 3_339, null);
    openAt("/app/sites/site_1/keywords/new-lost", "", {
      "siteChecks:siteChecks": { steps: [check("2026-09-22", "FIRST", 100, null), newest], newest },
    });
    render(<SiteNewLostPage />);

    expect(screen.getByText(/sites.newLost.startNotes.FIRST_LIST 3339/)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    const asked = vi.mocked(useQuery).mock.calls.filter(([, args]) => args !== "skip").map(([reference]) => convexPath(reference));
    expect(asked).not.toContain("siteKeywords:listMoves");
  });

  it("Wins and losses says a site checked once has nothing to compare, and lists nothing", () => {
    openAt("/app/sites/site_1/google/moves", "", {
      "sites:getMySite": { ...SITE, checkDays: ["2026-09-22"] },
      "siteCharts:siteSeries": line([]),
    });
    render(<SiteMovesPage />);

    expect(screen.getByText("sites.googleMoves.firstCheckTitle")).toBeInTheDocument();
    const asked = vi.mocked(useQuery).mock.calls.filter(([, args]) => args !== "skip").map(([reference]) => convexPath(reference));
    expect(asked).not.toContain("siteKeywords:listMoves");
  });

  const bands = { p01_03: 10, p04_10: 20, p11_20: 33, p21_50: 40, p51_up: 50 };

  const moves = {
    rankingDay: "2026-09-24",
    previousDay: "2026-09-23",
    start: null,
    bands,
    moves: [{ from: "p04_10", to: "p01_03", count: 2 }, { from: "none", to: "p51_up", count: 4 }],
    closest: { rows: [{ keyword: "seo agency", position: 11, volume: 900, traffic: 12, page: "/seo" }], total: 1 },
  };

  // The figures are the supplier's bands across every search the site ranks
  // for, as the menu counts them (sites-data-completeness-plan.md, §4.E): a
  // list held in part cannot give them. What moved is the list's own.
  it("Position bands heads with the bands across every search, and opens what it counts", () => {
    openAt("/app/sites/site_1/keywords/bands", "", {
      "siteCharts:siteSeries": line([
        point("2026-09-21", { keywords: 100, bands: { p01_03: 9, p04_10: 30, p11_20: 30, p21_50: 20, p51_up: 11 }, allBands: { ...bands, p01_03: 55 } }),
        point("2026-09-23", { keywords: 148, bands: { p01_03: 8, p04_10: 20, p11_20: 30, p21_50: 40, p51_up: 50 }, allBands: { ...bands, p01_03: 58 } }),
        point("2026-09-24", { keywords: 150, bands, allBands: { ...bands, p01_03: 61 } }),
      ]),
      "siteBands:bandMoves": moves,
      "siteBands:listBandMoves": { rows: [], cut: null, day: "2026-09-24" },
    });
    render(<SitePositionBandsPage />);

    // Page one across every search: 61 in the top 3 and 20 in 4–10.
    expect(screen.getByText("81")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sites.bands.inTop3 61/ }).getAttribute("href")).toContain("band=p01_03");
    // Every check counts every search: none is left out.
    expect(screen.queryByText(/sites.bands.early/)).toBeNull();
    const asOf = screen.getByText(/sites.bands.asOfCompared/).textContent;
    expect(asOf).toContain("23 Sept");
    // A square of the grid opens the searches that made that move, on a screen of its own.
    const square = screen.getByRole("link", { name: /sites.bands.moves.cell 2/ });
    expect(square.getAttribute("href")).toContain("/keywords/bands/moved?");
    expect(square.getAttribute("href")).toContain("move=p04_10.p01_03");
    // Two moved into the list's top 3 and none left it: it holds 10, from 8.
    expect(screen.getByText(/sites.bands.moves.someChanged/).textContent).toContain("10 8");
  });

  it("Position bands without the bands across every search counts the list, leaving out the checks before it was whole", () => {
    openAt("/app/sites/site_1/keywords/bands", "", {
      "siteCharts:siteSeries": line([
        // The first days checked only the everyday hundred: left out, and said so.
        point("2026-09-21", { keywords: 100, bands: { p01_03: 9, p04_10: 30, p11_20: 30, p21_50: 20, p51_up: 11 } }),
        point("2026-09-23", { keywords: 148, bands: { p01_03: 8, p04_10: 20, p11_20: 30, p21_50: 40, p51_up: 50 } }),
        point("2026-09-24", { keywords: 150, bands }),
      ]),
      "siteBands:bandMoves": moves,
      "siteBands:listBandMoves": { rows: [], cut: null, day: "2026-09-24" },
    });
    render(<SitePositionBandsPage />);

    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sites.bands.inTop3 10/ }).getAttribute("href")).toContain("band=p01_03");
    expect(screen.getByText(/sites.bands.early/)).toBeInTheDocument();
    // Compared with the last whole check before it, not with the everyday hundred.
    const asOf = screen.getByText(/sites.bands.asOfCompared/).textContent;
    expect(asOf).toContain("23 Sept");
    expect(asOf).not.toContain("21 Sept");
  });

  it("Position bands draws no grid for a start, with nothing to compare", () => {
    openAt("/app/sites/site_1/keywords/bands", "", {
      "siteCharts:siteSeries": line([point("2026-09-24", { keywords: 150, bands })]),
      "siteBands:bandMoves": {
        rankingDay: "2026-09-24", previousDay: "2026-09-22", start: "FIRST_LIST", bands, moves: [], closest: { rows: [], total: 0 },
      },
      "siteBands:listBandMoves": { rows: [], cut: null, day: "2026-09-24" },
    });
    render(<SitePositionBandsPage />);

    expect(screen.getByText(/sites.bands.moves.firstList/)).toBeInTheDocument();
    expect(screen.queryByText(/sites.bands.moves.legendUp/)).toBeNull();
  });
});

describe("paid search (2.2)", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  const advert = (keyword: string) => ({
    _id: keyword, keyword, position: 1, url: null, page: "/", volume: null, cpc: null, traffic: null, trafficCost: null, day: "2026-09-25",
  });

  it("Paid keywords says how few of the searches with adverts it holds, and shows unknowns as unknown", () => {
    openAt("/app/sites/site_1/paid/keywords", "", {
      "sites:getMySite": { ...SITE, counts: { paidKeywords: 450 } },
      "sitePaid:listPaidKeywords": { rows: [advert("carp rods"), advert("korda leads")], total: 2, pages: 1, page: 1, size: 25, cut: null, preparing: false },
    });
    render(<SitePaidKeywordsPage />);

    expect(screen.getByText("sites.paidKeywords.listing 2 450")).toBeInTheDocument();
    const cells = screen.getAllByRole("row")[1].textContent ?? "";
    expect(cells).not.toContain("$");
    expect(cells).not.toMatch(/\b0\b/);
  });

  it("Paid search says a website does not advertise only when a check found no adverts", () => {
    openAt("/app/sites/site_1/paid", "", { "siteCharts:siteSeries": line([]) });
    const { unmount } = render(<SitePaidPage />);
    expect(screen.queryByText("sites.paid.notAdvertising")).toBeNull();
    unmount();

    openAt("/app/sites/site_1/paid", "", { "siteCharts:siteSeries": line([point("2026-09-25", { paidKeywords: 0, paidTraffic: 0 })]) });
    render(<SitePaidPage />);
    expect(screen.getByText("sites.paid.notAdvertising")).toBeInTheDocument();
  });
});

describe("where links come from (2.3)", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  const profile = {
    day: "2026-09-25", backlinks: 10_000, referringDomains: 400, referringMainDomains: 380, domainRank: 300,
    brokenBacklinks: 10, brokenPages: 2, spamScore: 1, nofollowReferringDomains: 40,
    countries: [{ key: "GB", count: 5_000 }, { key: "US", count: 3_000 }, { key: "(rest)", count: 2_000 }],
    tlds: [], platforms: [], linkTypes: [],
    attributes: [{ key: "nofollow", count: 1_200 }, { key: "noopener", count: 800 }],
  };
  const shareOf = (group: string) => screen.getAllByRole("row").find((row) => row.textContent?.includes(group))?.textContent ?? "";

  it("gives each country its share of every link, and adds up the rest last", () => {
    openAt("/app/sites/site_1/backlinks/where", "", { "siteLinks:linkProfile": profile });
    render(<SiteLinkSourcesPage />);

    // 5,000 of the 10,000 links: half, not five-eighths of the named groups.
    expect(shareOf("United Kingdom")).toContain("50.0%");
    const rows = screen.getAllByRole("row").slice(1).map((row) => row.textContent ?? "");
    expect(rows.at(-1)).toContain("sites.linkSources.rest");
    expect(rows.at(-1)).toContain("20.0%");
  });

  it("sets overlapping groups against all the links, and says so", () => {
    openAt("/app/sites/site_1/backlinks/where", "by=attributes", { "siteLinks:linkProfile": profile });
    render(<SiteLinkSourcesPage />);

    expect(shareOf("nofollow")).toContain("12.0%");
    expect(screen.getByText(/sites.linkSources.overlapping/)).toBeInTheDocument();
  });
});

describe("full answers (3.2, 4.7)", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  const catalogue = {
    questions: [
      { prompt: "best carp rods", engines: ["chatgpt", "perplexity"], isActive: true },
      { prompt: "best bivvies", engines: ["chatgpt"], isActive: true },
    ],
    names: [],
  };

  it("says a question asked for by name is not on the list, rather than showing another", () => {
    openAt("/app/sites/site_1/ai/answers", "question=a+question+since+removed", { "siteAnswers:answerQuestions": catalogue });
    render(<SiteAnswersPage />);

    expect(screen.getByText("sites.aiAnswers.questionMissingTitle")).toBeInTheDocument();
    const asked = vi.mocked(useQuery).mock.calls.filter(([, args]) => args !== "skip").map(([reference]) => convexPath(reference));
    expect(asked).not.toContain("siteAnswers:listAnswers");
  });

  it("applies, and shows as chosen, only an engine the question is asked of", () => {
    openAt("/app/sites/site_1/ai/answers", "question=best+bivvies&engine=perplexity", { "siteAnswers:answerQuestions": catalogue });
    render(<SiteAnswersPage />);

    const listed = vi.mocked(useQuery).mock.calls.find(([reference, args]) => args !== "skip" && convexPath(reference).endsWith("siteAnswers:listAnswers"));
    expect(listed?.[1]).toMatchObject({ prompt: "best bivvies" });
    expect(listed?.[1]).not.toHaveProperty("engine");
    // The engine picker reads "all engines", not the one it is not applying.
    const pickers = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(pickers.map((picker) => picker.value)).toEqual(["best bivvies", ""]);
  });
});

describe("a list with everything paused (4.2)", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  const HEADER = {
    ...SITE, websiteId: "w1", placeLabel: "United Kingdom", checked: true, latestDay: "2026-09-26", lastCheckedAt: null, nextRunAt: null,
  };
  // The layout finds the page by its real address, so no numbering on it.
  const openLayout = (pathname: string, counts: Record<string, unknown>) => {
    openAt(pathname, "", { "sites:getMySite": { ...HEADER, counts } });
    nav.pathname = pathname;
  };
  const counts = (extra: Record<string, unknown>) => ({
    keywords: null, pages: null, top3: null, referringDomains: null, brokenBacklinks: null, aiNamed: 1, aiAsked: 4,
    rankedUp: null, rankedDown: null, suggestions: 0, citedPages: 0, paidKeywords: null, keywordsStored: null, ...extra,
  });

  it("keeps a page's history, and says every question is paused", () => {
    openLayout("/app/sites/site_1/ai/mentions", counts({ trackedSearches: 0, searchesPaused: false, questionsSetUp: true, questionsPaused: true }));
    render(<SiteLayout><p>what came in before</p></SiteLayout>);

    expect(screen.getByText("what came in before")).toBeTruthy();
    expect(screen.getByText("sites.setup.questions.paused")).toBeTruthy();
    expect(screen.queryByText("sites.setup.questions.title")).toBeNull();
  });

  it("keeps Your searches, and says every search is paused", () => {
    openLayout("/app/sites/site_1/google/searches", counts({ trackedSearches: 0, searchesPaused: true, questionsSetUp: false, questionsPaused: false }));
    render(<SiteLayout><p>what was checked before</p></SiteLayout>);

    expect(screen.getByText("what was checked before")).toBeTruthy();
    expect(screen.getByText("sites.setup.trackedSearches.paused")).toBeTruthy();
  });

  it("still says so when nothing is set up at all", () => {
    openLayout("/app/sites/site_1/google/searches", counts({ trackedSearches: 0, searchesPaused: false, questionsSetUp: false, questionsPaused: false }));
    render(<SiteLayout><p>nothing yet</p></SiteLayout>);

    expect(screen.queryByText("nothing yet")).toBeNull();
    expect(screen.getByText("sites.setup.trackedSearches.title")).toBeTruthy();
  });
});

describe("nothing known yet, and a competitor's AI (4.8, 4.9, 4.11)", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  it("a competitor's Overview says how many answers named it, never \"1 of 0\", and no pages before an answer", () => {
    openAt("/app/sites/site_rival", "", { "sites:getMySite": { ...SITE, counts: { questionsSetUp: true } } });
    const point = {
      day: "2026-09-25", lastDay: "2026-09-25", rankedUp: 0, rankedDown: 0, rankedNew: 0, rankedLost: 0,
      ai: [{ engine: "chatgpt" as const, asked: 0, named: 1, recommended: 0 }],
    };
    const extras = {
      homePageRank: null, aiOverviewPages: 0, aiOverviewCapped: false,
      assistants: [{ engine: "chatgpt", pages: 2 }, { engine: "perplexity", pages: null }],
      pages: { total: 0, visits: 0, capped: false, kinds: [], visitBands: [] },
      competitors: { found: 0, you: { keywords: null, visits: null }, rivals: [] },
    } as unknown as Parameters<typeof OverviewPanels>[0]["extras"];
    render(<OverviewPanels latest={point} before={null} extras={extras} />);

    expect(screen.getByText("sites.overview.panels.ai.namedIn 1")).toBeTruthy();
    expect(screen.queryByText(/panels\.ai\.namedOf/)).toBeNull();
    // ChatGPT links to two of its pages; Perplexity has not answered, so none are counted.
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("Mentions shows no count before an engine has answered, and the count once it has", () => {
    const mention = { prompt: "who designs websites in surrey", warnedAgainst: 0, lastStance: null };
    openAt("/app/sites/site_1/ai/mentions", "", {
      "siteAi:listMentions": [
        { ...mention, engine: "chatgpt", asked: 3, named: 1, recommended: 1, lastAskedDay: "2026-09-25", lastStance: "RECOMMENDED" },
        { ...mention, engine: "perplexity", asked: 0, named: 0, recommended: 0, lastAskedDay: null },
      ],
      "siteCharts:siteSeries": [],
    });
    render(<SiteMentionsPage />);

    expect(screen.getByText("sites.aiMentions.namedOf 1 3")).toBeTruthy();
    expect(screen.queryByText("sites.aiMentions.namedOf 0 0")).toBeNull();
    expect(screen.getAllByText("–").length).toBeGreaterThanOrEqual(2);
  });

  const figures = (websiteId: string, host: string, isYou = false) => ({
    websiteId, host, isYou, day: "2026-09-24", keywords: 100, top3: 5, estimatedTraffic: 500, backlinks: 10, referringDomains: 4, domainRank: 30,
  });
  const rivalRow = (websiteId: string, host: string, rankedOn: number, beatsYouOn: number) => ({
    websiteId, host, relationship: "TRACKED", beatsYouOn, youBeatOn: 0, comparedOn: 100, rankedOn, namedInAnswers: 0, answersCounted: 0, lastSeenDay: null, verdict: "NOT_CHECKED",
  });
  const line = (host: string, isYou = false) => ({ websiteId: host, host, isYou, before: null, points: [] });

  it("Side by side counts searches only for a competitor with places, and says which five the chart draws", () => {
    const rivals = Array.from({ length: 7 }, (_, index) => hold(`site_r${index}`, `r${index}.com`, "TRACKED", "a.com"));
    openAt("/app/sites/site_1/competitors", "", {
      "sites:getMySite": { ...SITE, rivals },
      "siteCharts:siteAndRivals": [figures("w1", "a.com", true), figures("w_placed", "placed.com"), figures("w_none", "unplaced.com")],
      "siteCompetitors:listRivals": [rivalRow("w_placed", "placed.com", 60, 12), rivalRow("w_none", "unplaced.com", 0, 0)],
      "siteCharts:siteSeries": [line("a.com", true), ...["r1.com", "r2.com", "r3.com", "r4.com", "r5.com"].map((host) => line(host))],
    });
    render(<SiteSideBySidePage />);

    expect(screen.getByText("sites.sideBySide.searchesOf 12 100")).toBeTruthy();
    expect(screen.queryByText("sites.sideBySide.searchesOf 0 100")).toBeNull();
    expect(screen.getByText("sites.sideBySide.chartHintSome 5 7")).toBeTruthy();
  });
});

describe("the backlinks summary (4.12)", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  const point = (day: string, figures: Record<string, number>) => ({ day, lastDay: day, rankedUp: 0, rankedDown: 0, rankedNew: 0, rankedLost: 0, ai: [], ...figures });
  // A figure that opens a list carries an arrow after its label.
  const figure = (label: string) => screen.getByText(new RegExp(`^sites\\.backlinks\\.${label}( →)?$`)).parentElement?.textContent ?? "";

  it("shows all four as they stood at the end of the dates, when the dates hold no link count", () => {
    openAt("/app/sites/site_1/backlinks", "from=2026-09-20&to=2026-09-26", {
      "sites:getMySite": { ...SITE, counts: { referringDomains: 999, brokenBacklinks: 99 } },
      "siteCharts:siteSeries": [{
        websiteId: "w1", host: "a.com", isYou: true,
        points: [point("2026-09-24", { keywords: 120 })],
        before: point("2026-09-19", { domainRank: 210, backlinks: 640, referringDomains: 81, brokenBacklinks: 3 }),
      }],
    });
    render(<SiteBacklinksPage />);

    expect(figure("domainRank")).toContain("210");
    expect(figure("backlinks")).toContain("640");
    expect(figure("referringDomains")).toContain("81");
    expect(figure("broken")).toContain("3");
    // Never today's in place of the dates'.
    expect(figure("referringDomains")).not.toContain("999");
  });

  it("shows none of them when nothing came before or in the dates", () => {
    openAt("/app/sites/site_1/backlinks", "from=2026-09-20&to=2026-09-26", {
      "sites:getMySite": { ...SITE, counts: { referringDomains: 999, brokenBacklinks: 99 } },
      "siteCharts:siteSeries": [{ websiteId: "w1", host: "a.com", isYou: true, points: [], before: null }],
    });
    render(<SiteBacklinksPage />);

    for (const label of ["domainRank", "backlinks", "referringDomains", "broken"]) expect(figure(label)).not.toMatch(/\d/);
  });
});

describe("link quality's nofollow count (4.13)", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  it("opens the live linking websites with a nofollow link, not every nofollow link", () => {
    openAt("/app/sites/site_1/backlinks/quality", "", {
      "siteLinks:linkProfile": { day: "2026-09-24", spamScore: 12, brokenBacklinks: 3, brokenPages: 1, nofollowReferringDomains: 41 },
      "siteCharts:siteSeries": [],
    });
    render(<SiteLinkQualityPage />);

    const href = screen.getByText(/^sites\.linkQuality\.nofollow →$/).closest("a")?.getAttribute("href") ?? "";
    expect(href).toContain("/backlinks/domains?");
    expect(href).toContain("follow=NOFOLLOW");
    expect(href).toContain("status=LIVE");
    expect(href).not.toContain("/backlinks/all");
  });
});

describe("links gained and lost, by step (4.3)", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    window.localStorage.clear();
  });

  const change = (day: string) => ({ day, newBacklinks: 3, lostBacklinks: 1, newReferringDomains: 2, lostReferringDomains: 0 });

  it.each([
    ["day", "sites.backlinksNewLost.columns.day", "ui.tableBar.days"],
    ["week", "sites.backlinksNewLost.columns.week", "ui.tableBar.weeks"],
    ["month", "sites.backlinksNewLost.columns.month", "ui.tableBar.months"],
  ])("names a row a %s when the dates are stepped by it", (step, header, noun) => {
    openAt("/app/sites/site_1/backlinks/new-lost", `from=2026-06-01&to=2026-09-26&step=${step}`, {
      "siteLinkLists:linkChanges": [change("2026-08-01"), change("2026-09-01")],
    });
    render(<SiteLinksNewLostPage />);

    expect(screen.getAllByText(header).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`^${noun.replace(/\./g, "\\.")} 2$`))).toBeTruthy();
    if (step !== "week") expect(screen.queryByText("sites.backlinksNewLost.columns.week")).toBeNull();
  });
});
