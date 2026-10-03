import { act, fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import SiteYourPagesPage from "./page";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
// The shared mock, with the values a wording is given written after its key.
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
  usePathname: () => "/app/sites/site_1/your-pages",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ siteId: "site_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());

/** ronins.co.uk's figures as drawn on 2026-10-03: 139 in four sitemap files, 157 crawled, 158 shown by Google, 66 ranking, 175 pages. */
const SUMMARY = {
  pages: 175, sitemap: 139, crawled: 157, shown: 158, ranking: 66,
  neverShown: 6, notInSitemap: 25, crawledNotInSitemap: 19, notCrawled: 1,
  sitemapRead: true, sitemapSource: "ROBOTS", sitemapFiles: 4, sitemapFailed: 0, sitemapCut: false, sitemapLimit: 5_000, sitemapDay: "2026-10-03",
  console: true, consoleFrom: "2026-07-04", consoleTo: "2026-10-01", crawlDay: "2026-09-28", builtAt: 1,
};

function row(page: string, extra: Partial<{ file: string | null; crawled: boolean; shown: boolean; ranks: boolean; clicks: number; group: string | null; kind: string }> = {}) {
  return { page, file: "page-sitemap.xml", crawled: true, shown: true, ranks: true, clicks: 0, group: null, kind: "SERVICE", ...extra };
}

const ROWS = [
  row("/ai-agency/", { clicks: 453 }),
  row("/hub/kapferer-brand-identity-prism/", { file: "content-hub-sitemap.xml", clicks: 414, kind: "ARTICLE" }),
  row("/author/anthony/", { file: null, ranks: false, clicks: 15, kind: "UNJUDGED" }),
];

function answer(extra: Record<string, unknown> = {}) {
  return {
    rows: ROWS, total: 175, page: 1, pages: 7, size: 25, cut: null, preparing: false,
    own: true, summary: SUMMARY, groupBy: "KIND", groups: [{ value: "ARTICLE", label: "ARTICLE" }, { value: "SERVICE", label: "SERVICE" }],
    ...extra,
  };
}

function open(list: Record<string, unknown> = answer(), site: Record<string, unknown> = { host: "ronins.co.uk", counts: {} }) {
  const ensure = vi.fn(async () => null);
  vi.mocked(useMutation).mockImplementation(((reference: unknown) => (convexPath(reference).endsWith("ensureYourPages") ? ensure : vi.fn())) as never);
  vi.mocked(useQuery).mockImplementation(answerQueries({ "sites:getMySite": site, "yourPages:listYourPages": list }));
  render(<SiteYourPagesPage />);
  return ensure;
}

/** The table's rows, under its heading row. */
const bodyRows = () => screen.getAllByRole("row").slice(1);

/** What the page last asked the server for. */
const lastAsked = () => vi.mocked(useQuery).mock.calls.filter(([reference]) => convexPath(reference).endsWith("listYourPages")).at(-1)?.[1] as Record<string, unknown>;

/**
 * Your pages (docs/plans/active/page-groups-plan.md, decision 4; board 23):
 * every page of the website once, the four figures that filter it, the gaps,
 * and each page's group.
 */
describe("the Your pages page", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    nav.replace.mockClear();
    nav.push.mockClear();
    nav.search = "";
  });

  it("shows the four figures, each opening the list narrowed to it", () => {
    open();

    for (const [key, value, detail] of [
      ["sitemap", "139", "sites.yourPages.figures.sitemapDetail 4"],
      ["crawled", "157", "sites.yourPages.figures.crawledDetail"],
      ["shown", "158", "sites.yourPages.figures.shownDetail"],
      ["ranking", "66", "sites.yourPages.figures.rankingDetail"],
    ]) {
      const figure = screen.getByText(`sites.yourPages.figures.${key} →`).closest("a")!;
      expect(figure).toHaveTextContent(value);
      expect(figure).toHaveTextContent(detail);
      expect(figure.getAttribute("href")).toBe(`/app/sites/site_1/your-pages?filter=${key}`);
    }
    expect(screen.getByText("ui.tableBar.pages 175")).toBeInTheDocument();
  });

  it("offers each gap with its count, and asks the server for the one chosen", () => {
    open();

    const differs = screen.getByLabelText("sites.yourPages.filters.differs");
    const options = within(differs).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual([
      "sites.yourPages.filters.everyPage",
      "sites.yourPages.filters.options.neverShown (6)",
      "sites.yourPages.filters.options.notInSitemap (25)",
      "sites.yourPages.filters.options.crawledNotInSitemap (19)",
      "sites.yourPages.filters.options.notCrawled (1)",
      "sites.yourPages.filters.options.sitemap (139)",
      "sites.yourPages.filters.options.crawled (157)",
      "sites.yourPages.filters.options.shown (158)",
      "sites.yourPages.filters.options.ranking (66)",
    ]);
    fireEvent.change(differs, { target: { value: "notInSitemap" } });
    expect(nav.replace).toHaveBeenCalledWith("/app/sites/site_1/your-pages?filter=notInSitemap", { scroll: false });
  });

  it("reads the gap, the group and the order from the address, and says how many of the whole list are shown", () => {
    nav.search = "filter=notInSitemap&group=ARTICLE&sort=page";
    open(answer({ total: 25 }));

    expect(lastAsked()).toMatchObject({ siteId: "site_1", filter: "notInSitemap", group: "ARTICLE", sort: "page", direction: "asc", page: 1, rows: 25 });
    expect(screen.getByText("sites.yourPages.ofAll 175")).toBeInTheDocument();
  });

  it("opens on the most clicks, with a page not in the sitemap saying so, and ticks or dashes for crawled, shown and ranks", () => {
    open();

    expect(lastAsked()).toMatchObject({ sort: "clicks", direction: "desc" });
    const rows = bodyRows();
    expect(rows[0]).toHaveTextContent("/ai-agency/");
    expect(rows[0]).toHaveTextContent("453");
    const archive = rows[2];
    expect(within(archive).getByText("sites.yourPages.notInSitemap")).toBeInTheDocument();
    // Ranks is a dash, read out as "no"; crawled and shown are ticks, read out as "yes".
    expect(within(archive).getAllByText("sites.common.yes")).toHaveLength(2);
    expect(within(archive).getByText("sites.yourPages.no")).toBeInTheDocument();
    expect(within(archive).getByRole("link", { name: "/author/anthony/" }).getAttribute("href")).toMatch(/^\/app\/sites\/site_1\/keywords\/pages\/page\?path=%2Fauthor%2Fanthony%2F/);
  });

  it("groups by Hakken's own kind of page until the website has classifications", () => {
    open();

    const rows = bodyRows();
    expect(within(rows[0]).getByText("sites.common.pageTypes.SERVICE")).toBeInTheDocument();
    expect(within(rows[1]).getByText("sites.common.pageTypes.ARTICLE")).toBeInTheDocument();
    const group = screen.getByLabelText("sites.yourPages.filters.group");
    expect(within(group).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "sites.yourPages.filters.everyGroup", "sites.common.pageTypes.ARTICLE", "sites.common.pageTypes.SERVICE",
    ]);
  });

  it("then by the company's own classification, Not sorted where none catches the page", () => {
    open(answer({
      groupBy: "CLASSIFICATION",
      groups: [{ value: "c1", label: "AI services" }, { value: "c2", label: "Content hub" }],
      rows: [row("/ai-agency/", { group: "AI services" }), row("/hub/kapferer-brand-identity-prism/", { group: "Content hub" }), row("/author/anthony/", { group: null })],
    }));

    const rows = bodyRows();
    expect(within(rows[0]).getByText("AI services")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Content hub")).toBeInTheDocument();
    expect(within(rows[2]).getByText("sites.yourPages.notSorted")).toBeInTheDocument();
    const group = screen.getByLabelText("sites.yourPages.filters.group");
    expect(within(group).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "sites.yourPages.filters.everyGroup", "AI services", "Content hub", "sites.yourPages.notSorted",
    ]);
  });

  it("says when no sitemap was found, and offers no gap it cannot tell", () => {
    open(answer({ summary: { ...SUMMARY, sitemapSource: "NONE", sitemap: 0, sitemapFiles: 0 } }));

    expect(screen.getByText("sites.yourPages.notices.noSitemap")).toBeInTheDocument();
    expect(screen.getByText("sites.yourPages.figures.sitemap →").closest("a")).toHaveTextContent("sites.yourPages.figures.sitemapNone");
    const options = within(screen.getByLabelText("sites.yourPages.filters.differs")).getAllByRole("option").map((option) => option.textContent ?? "");
    expect(options.some((option) => option.includes("options.neverShown"))).toBe(false);
    expect(options.some((option) => option.includes("options.notCrawled"))).toBe(false);
  });

  it("says when the reading stopped at the limit", () => {
    open(answer({ summary: { ...SUMMARY, sitemapCut: true, sitemapLimit: 5_000 } }));

    expect(screen.getByText(/^sites\.yourPages\.notices\.cut 5,000/)).toBeInTheDocument();
  });

  it("says when the sitemap has not been read yet, and when Search Console is not connected", () => {
    open(answer({ summary: { ...SUMMARY, sitemapRead: false, sitemapSource: null, console: false } }));

    expect(screen.getByText("sites.yourPages.notices.notReadYet")).toBeInTheDocument();
    const shown = screen.getByText("sites.yourPages.figures.shown →").closest("a")!;
    expect(shown).toHaveTextContent("–");
    expect(shown).toHaveTextContent("sites.yourPages.figures.shownNotConnected");
  });

  it("asks for a list never built yet, once, and shows it loading", async () => {
    const ensure = open(answer({ rows: [], total: 0, preparing: true, summary: null }));

    await act(async () => {});
    expect(ensure).toHaveBeenCalledWith({ siteId: "site_1" });
    expect(screen.queryByText("sites.yourPages.empty")).not.toBeInTheDocument();
  });

  it("tells a competitor's page that Your pages is the company's own, and leads to its website", () => {
    open(answer({ own: false, rows: [], total: 0, summary: null }), { host: "rival.example", ofSiteId: "site_0", ofHost: "ronins.co.uk", counts: {} });

    expect(screen.getByText("sites.yourPages.notices.competitor")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "sites.yourPages.notices.competitorLink ronins.co.uk" })).toHaveAttribute("href", "/app/sites/site_0/your-pages");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
