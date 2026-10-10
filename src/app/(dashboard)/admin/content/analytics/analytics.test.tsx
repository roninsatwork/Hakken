import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import AnalyticsOverviewPage from "./page";
import AnalyticsArticlesPage from "./articles/page";
import AnalyticsArticlePage from "./articles/[itemKey]/page";
import AnalyticsCompanyPage from "./companies/[companyId]/page";

const { push, replace, nav } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  nav: { params: {} as Record<string, string>, search: "" },
}));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("../../../app/sites/_components/SiteCharts", async (original) => ({
  ...(await original<typeof import("../../../app/sites/_components/SiteCharts")>()),
  // The chart's own drawing has its tests; here it only has to be there.
  SiteLineChart: () => <div data-testid="line-chart" />,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/content/analytics",
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => nav.params,
  useRouter: () => ({ push, replace, back: vi.fn(), prefetch: vi.fn() }),
}));

const RANGE = { from: "2026-09-10", to: "2026-10-09", days: 30 };
const ITEM = {
  itemKey: "WEB:article_1", title: "What the October core update changed", fromName: "Glenn Gabe", source: "PERSON", where: "KNOWLEDGE", topic: "RANKINGS",
  views: 412, reads: 188, clicks: 61, answers: 23, readRate: 46,
};
const OVERVIEW = {
  range: RANGE,
  figures: { views: 3068, reads: 1117, clicks: 340, answers: 40, viewsBefore: 2600, readers: 146, companies: 31 },
  days: [{ day: "2026-10-08", views: 120, reads: 40, clicks: 9, answers: 2 }],
  counts: { articles: 64, people: 6, companies: 31 },
  top: {
    articles: [ITEM, { ...ITEM, itemKey: "OURS:ours_1", title: "How is traffic worked out?", fromName: "", source: "OURS" }],
    people: [{ followId: "glenn", name: "Glenn Gabe", views: 653, clicks: 94 }],
    companies: [{ companyId: "korda", name: "Korda", readers: 9, views: 412 }],
    users: [{ userId: "james", name: "James Okafor", companyName: "Korda", views: 88 }],
  },
};
const ARTICLES = {
  range: RANGE,
  page: { rows: [{ ...ITEM, trend: [{ day: "2026-10-08", views: 40 }] }], total: 1, page: 1, pages: 1, size: 15 },
  days: OVERVIEW.days,
  daysCut: false,
  people: [{ followId: "glenn", name: "Glenn Gabe" }],
};
const ARTICLE = {
  range: RANGE,
  item: { title: ITEM.title, fromName: "Glenn Gabe", where: "KNOWLEDGE", topic: "RANKINGS", url: "https://www.gsqi.com/october", publishedAt: Date.UTC(2026, 8, 18), keptAt: Date.UTC(2026, 8, 19) },
  figures: { views: 108, reads: 47, clicks: 16, answers: 8, viewsBefore: 0 },
  days: OVERVIEW.days,
  companies: [{ companyId: "korda", name: "Korda", readers: 4, views: 31, reads: 14, clicks: 5, lastAt: Date.UTC(2026, 9, 9) }],
  readers: 13,
};
const COMPANY = {
  range: RANGE,
  name: "Korda",
  lastAt: Date.UTC(2026, 9, 9),
  figures: { views: 412, reads: 158, clicks: 47, answers: 0, viewsBefore: 338, readers: 9, people: 14 },
  days: OVERVIEW.days,
  people: [{ userId: "james", name: "James Okafor", views: 88, reads: 35, clicks: 10, topMost: "RANKINGS", lastAt: Date.UTC(2026, 9, 9) }],
};

/**
 * Admin → Content → Analytics (docs/plans/active/content-people-knowledge-
 * plan.md, boards 7–12): the period kept in the address, Overview's figures
 * and top five, Articles narrowed and sorted on the server, one article's
 * companies, and one company's people.
 */
describe("Admin Analytics", () => {
  beforeEach(() => {
    push.mockReset();
    replace.mockReset();
    nav.params = {};
    nav.search = "";
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "readingAnalytics:analyticsOverview": OVERVIEW,
      "readingAnalytics:analyticsArticles": ARTICLES,
      "readingAnalytics:analyticsArticle": ARTICLE,
      "readingAnalytics:analyticsCompany": COMPANY,
      "topics:listTopicChoices": [{ key: "RANKINGS", nameEn: "Rankings" }],
    }));
  });

  const lastArgs = (name: string) => vi.mocked(useQuery).mock.calls.filter(([reference]) => convexPath(reference).endsWith(name)).at(-1)?.[1];

  it("Overview: the figures beside the period before, the tabs counted, readers opening Companies, and the top five in tabs", () => {
    nav.search = "period=90";
    renderWithProviders(<AnalyticsOverviewPage />);

    expect(lastArgs("analyticsOverview")).toEqual({ period: "90" });
    expect(screen.getByText("3,068")).toBeInTheDocument();
    expect(screen.getByText("admin.contentAnalytics.overview.up")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /admin\.contentAnalytics\.tabs\.articles 64/ })).toHaveAttribute("href", "/admin/content/analytics/articles?period=90");
    expect(screen.getByRole("link", { name: /admin\.contentAnalytics\.measures\.readers/ })).toHaveAttribute("href", "/admin/content/analytics/companies?period=90");

    // Ours is said as ours; the web's by who it is from.
    expect(screen.getByText("admin.contentAnalytics.from.ours")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "admin.contentAnalytics.top.tabs.users" }));
    expect(screen.getByText("James Okafor")).toBeInTheDocument();
    expect(screen.queryByText("What the October core update changed")).not.toBeInTheDocument();
  });

  it("the period is chosen at the top and kept in the address", () => {
    renderWithProviders(<AnalyticsOverviewPage />);
    fireEvent.click(screen.getByRole("radio", { name: "admin.contentAnalytics.periods.7" }));
    expect(replace).toHaveBeenCalledWith("/admin/content/analytics?period=7");
  });

  it("Articles: narrowed and sorted on the server, each row with its trend, opening the article's page", () => {
    renderWithProviders(<AnalyticsArticlesPage />);
    expect(lastArgs("analyticsArticles")).toMatchObject({ period: "30", sort: "views", direction: "desc", page: 1, rows: 15 });

    const row = screen.getByText(ITEM.title).closest("tr") as HTMLElement;
    expect(within(row).getByText("46%")).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: "admin.contentAnalytics.columns.trendLabel" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("admin.contentAnalytics.filters.from"), { target: { value: "glenn" } });
    fireEvent.change(screen.getByLabelText("admin.contentAnalytics.filters.where"), { target: { value: "KNOWLEDGE" } });
    fireEvent.click(screen.getByRole("button", { name: /admin\.contentAnalytics\.columns\.readRate/ }));
    expect(lastArgs("analyticsArticles")).toMatchObject({ from: "glenn", where: "KNOWLEDGE", sort: "readRate", direction: "desc", page: 1 });

    fireEvent.click(screen.getByText(ITEM.title));
    expect(push).toHaveBeenCalledWith("/admin/content/analytics/articles/WEB%3Aarticle_1");
  });

  it("one article: its facts, figures and each company that read it", () => {
    nav.params = { itemKey: "WEB%3Aarticle_1" };
    renderWithProviders(<AnalyticsArticlePage />);

    expect(lastArgs("analyticsArticle")).toEqual({ itemKey: "WEB:article_1", period: "30" });
    expect(screen.getByText(/Glenn Gabe · gsqi\.com/)).toBeInTheDocument();
    expect(screen.getByText("admin.contentAnalytics.overview.nothingBefore")).toBeInTheDocument();
    const korda = screen.getByText("Korda").closest("tr") as HTMLElement;
    expect(within(korda).getByText("31")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Korda"));
    expect(push).toHaveBeenCalledWith("/admin/content/analytics/companies/korda");
  });

  it("one company: how many of its people read, who did not, and what each reads most", () => {
    nav.params = { companyId: "korda" };
    renderWithProviders(<AnalyticsCompanyPage />);

    expect(screen.getByText("admin.contentAnalytics.company.ofPeople")).toBeInTheDocument();
    expect(screen.getByText("admin.contentAnalytics.company.notOpened")).toBeInTheDocument();
    const james = screen.getByText("James Okafor").closest("tr") as HTMLElement;
    expect(within(james).getByText("Rankings")).toBeInTheDocument();
  });
});
