import { fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import NewsPage from "./page";
import NewsStoryPage from "./[itemId]/page";

const nav = vi.hoisted(() => ({ locale: "en", search: "", pathname: "/app/news" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return { ...base, useLocale: () => nav.locale };
});
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({ itemId: "item_update" }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const at = (day: string) => Date.parse(`${day}T12:00:00Z`);

const LEAD = {
  _id: "item_update", kind: "GOOGLE_UPDATE", sourceName: "Google", title: "September 2026 spam update",
  summary: "Google is rolling out a spam update.", meaning: "Wait for it to finish before changing pages.",
  url: "https://status.search.google.com/2", publishedAt: at("2026-09-24"),
  update: { startedOn: "2026-09-24", finishedOn: null, expectedDays: 14 },
};
const plain = (id: string, title: string, day: string, kind = "WEBSITE") => ({
  _id: id, kind, sourceName: "Search Engine Land", title, summary: `${title}, in short.`, meaning: "", url: `https://example.com/${id}`, publishedAt: at(day), update: null,
});
const FEED = [
  LEAD,
  plain("item_1", "Search Console shows AI clicks", "2026-09-30"),
  plain("item_2", "Why AI Overviews quote first lines", "2026-09-29", "YOUTUBE"),
  plain("item_3", "First drops from the spam update", "2026-09-28", "X"),
  plain("item_4", "A complete Business Profile", "2026-09-27", "YOUTUBE"),
];
const ARTICLE = { _id: "article_1", title: "How is traffic worked out?", excerpt: "Traffic is an estimate.", words: 400, topic: "TRAFFIC", publishedAt: at("2026-09-30"), updatedAt: at("2026-09-30") };
const HELPFUL = {
  _id: "helpful_1", url: "https://ahrefs.com/blog/link-building/", title: "Link building for SEO", publication: "Ahrefs", author: null, publishedOn: null,
  language: "en", topic: "BACKLINKS", words: 3000, addedAt: at("2026-09-27"), summary: "How sites earn links.", meaning: null,
};
const UPDATES = [
  { _id: "update_1", title: "September 2026 spam update", itemId: "item_update", startedOn: "2026-09-24", finishedOn: null, expectedDays: 14 },
  { _id: "update_2", title: "August 2026 core update", itemId: null, startedOn: "2026-08-19", finishedOn: "2026-09-04", expectedDays: 14 },
];
const COUNTS = {
  news: { all: 24, GOOGLE_UPDATE: 1, WEBSITE: 5, YOUTUBE: 9, X: 0 },
  follows: 6,
  topics: [{ key: "TRAFFIC", name: "Traffic" }, { key: "RANKINGS", name: "Rankings" }, { key: "AI_ANSWERS", name: "AI answers" }, { key: "BACKLINKS", name: "Backlinks" }], articles: { all: 2, byTopic: { TRAFFIC: 1 } }, helpful: { all: 0, byTopic: {} },
};

const loadMore = vi.fn();

/**
 * News, in Learn (docs/plans/active/knowledge-news-and-digest-plan.md, revised
 * again 2026-10-01, R4–R10): the front page leads with one story and sets the
 * rest out as drawn; a kind lists alone; a story opens on its own page.
 */
describe("News", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T09:00:00"));
    nav.locale = "en";
    nav.search = "";
    nav.pathname = "/app/news";
    loadMore.mockReset();
    vi.mocked(usePaginatedQuery).mockReset().mockReturnValue({ results: FEED, status: "CanLoadMore", isLoading: false, loadMore } as never);
    vi.mocked(useQuery).mockReset().mockImplementation(answerQueries({
      "news:getFrontPage": { lead: { source: "NEWS", item: LEAD }, weekCount: 24 },
      "googleUpdates:listLatestGoogleUpdates": UPDATES,
      "knowledgeArticles:listPublishedSince": [ARTICLE],
      "libraryArticles:listForReadersSince": [HELPFUL],
      "learnMenu:getLearnMenuCounts": COUNTS,
      "news:getNewsItem": LEAD,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("leads with one story, its rollout and what it means, beside the last Google updates", () => {
    render(<NewsPage />);

    const lead = screen.getByRole("region", { name: "news.front.leadLabel" });
    const headline = within(lead).getByRole("heading", { level: 2 });
    expect(within(headline).getByRole("link", { name: "September 2026 spam update" })).toHaveAttribute("href", "/app/news/item_update");
    expect(within(lead).getByText("Google is rolling out a spam update.")).toBeInTheDocument();
    expect(within(lead).getByText("news.rollout.rollingOut")).toBeInTheDocument();
    expect(within(lead).getByText("Wait for it to finish before changing pages.")).toBeInTheDocument();
    expect(within(lead).getByRole("link", { name: /news\.story\.readGoogle/ })).toHaveAttribute("href", LEAD.url);
    expect(within(lead).getByRole("link", { name: "news.story.askHakken" }).getAttribute("href")).toMatch(/^\/app\/assistant\?ask=/);

    const updates = within(lead).getByRole("complementary", { name: "news.updates.title" });
    expect(within(updates).getByRole("link", { name: "September 2026 spam update" })).toHaveAttribute("href", "/app/news/item_update");
    expect(within(updates).getByText("August 2026 core update")).toBeInTheDocument();
    expect(within(updates).getByRole("link", { name: /news\.updates\.all/ })).toHaveAttribute("href", "/app/news?kind=GOOGLE_UPDATE");
  });

  it("sets the next three stories in columns — a new article among them — and the rest one to a line", () => {
    render(<NewsPage />);

    const columns = within(screen.getByRole("region", { name: "news.front.moreLabel" })).getAllByRole("article");
    expect(columns.map((column) => within(column).getByRole("heading").textContent)).toEqual([
      "Search Console shows AI clicks",
      "How is traffic worked out?",
      "Why AI Overviews quote first lines",
    ]);
    expect(within(columns[1]).getByRole("link", { name: "How is traffic worked out?" })).toHaveAttribute("href", "/app/knowledge/article_1");

    const earlier = screen.getByRole("region", { name: "news.front.earlier" });
    expect(within(earlier).getByRole("link", { name: "First drops from the spam update" })).toHaveAttribute("href", "/app/news/item_3");
    expect(within(earlier).getByRole("link", { name: "A complete Business Profile" })).toBeInTheDocument();
    // A Helpful content article added this week takes its place among them (insights-helpful-content-plan.md, IH8).
    expect(within(earlier).getByRole("link", { name: "Link building for SEO" })).toHaveAttribute("href", "/app/helpful-content/helpful_1");

    fireEvent.click(within(earlier).getByRole("button", { name: "news.front.showMore" }));
    expect(loadMore).toHaveBeenCalledWith(20);
  });

  // One lead story, pinned from News, Knowledge or Helpful content (insights-helpful-content-plan.md, IH11).
  it("leads with a pinned Knowledge or Helpful content article as it leads its own page, and does not list it again", () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "news:getFrontPage": { lead: { source: "HELPFUL", article: { ...HELPFUL, meaning: "Earn links worth having." } }, weekCount: 24 },
      "googleUpdates:listLatestGoogleUpdates": UPDATES,
      "knowledgeArticles:listPublishedSince": [ARTICLE],
      "libraryArticles:listForReadersSince": [HELPFUL],
      "learnMenu:getLearnMenuCounts": COUNTS,
    }));
    const { unmount } = render(<NewsPage />);

    const lead = screen.getByRole("region", { name: "news.front.leadLabel" });
    expect(within(within(lead).getByRole("heading", { level: 2 })).getByRole("link", { name: "Link building for SEO" })).toHaveAttribute("href", "/app/helpful-content/helpful_1");
    expect(within(lead).getByText("Earn links worth having.")).toBeInTheDocument();
    expect(within(lead).getByRole("link", { name: /learn\.helpful\.readOn/ })).toHaveAttribute("href", HELPFUL.url);
    expect(screen.getAllByRole("link", { name: "Link building for SEO" })).toHaveLength(1);
    unmount();

    vi.mocked(useQuery).mockImplementation(answerQueries({
      "news:getFrontPage": { lead: { source: "KNOWLEDGE", article: ARTICLE }, weekCount: 24 },
      "googleUpdates:listLatestGoogleUpdates": UPDATES,
      "knowledgeArticles:listPublishedSince": [ARTICLE],
      "libraryArticles:listForReadersSince": [],
      "learnMenu:getLearnMenuCounts": COUNTS,
    }));
    render(<NewsPage />);
    const knowledgeLead = screen.getByRole("region", { name: "news.front.leadLabel" });
    expect(within(knowledgeLead).getByRole("link", { name: /knowledgeArticles\.front\.readArticle/ })).toHaveAttribute("href", "/app/knowledge/article_1");
    expect(screen.getAllByRole("link", { name: "How is traffic worked out?" })).toHaveLength(1);
  });

  it("asks for the reader's language and day", () => {
    nav.locale = "it";
    render(<NewsPage />);

    expect(vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1]).toEqual({ language: "it" });
    const frontPage = vi.mocked(useQuery).mock.calls.find(([, args]) => (args as { today?: string })?.today && (args as { language?: string }).language);
    expect(frontPage?.[1]).toEqual({ language: "it", today: "2026-10-01" });
  });

  it("lists one kind alone when the side menu asks for it", () => {
    nav.search = "kind=YOUTUBE";
    render(<NewsPage />);

    expect(vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1]).toEqual({ kind: "YOUTUBE", language: "en" });
    expect(screen.getByRole("heading", { name: "news.front.kindHeadings.YOUTUBE" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "news.front.leadLabel" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /learn\.menu\.kinds\.YOUTUBE/ })).toHaveAttribute("aria-current", "page");
  });

  it("says so when there is no news yet", () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "news:getFrontPage": { lead: null, weekCount: 0 }, "learnMenu:getLearnMenuCounts": COUNTS }));
    vi.mocked(usePaginatedQuery).mockReturnValue({ results: [], status: "Exhausted", isLoading: false, loadMore } as never);
    render(<NewsPage />);

    expect(screen.getByText("news.front.emptyTitle")).toBeInTheDocument();
  });

  it("has Insights' side menu: news by kind, who to follow, and the topics that have articles", () => {
    render(<NewsPage />);

    const menu = screen.getByRole("navigation", { name: "learn.menu.label" });
    expect(within(menu).getByRole("link", { name: /learn\.menu\.allNews/ })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: /learn\.menu\.allNews/ })).toHaveTextContent("24");
    expect(within(menu).getByRole("link", { name: /learn\.menu\.kinds\.YOUTUBE/ })).toHaveAttribute("href", "/app/news?kind=YOUTUBE");
    expect(within(menu).getByRole("link", { name: /learn\.menu\.whoToFollow/ })).toHaveAttribute("href", "/app/who-to-follow");
    expect(within(menu).getByRole("link", { name: /^Traffic/ })).toHaveAttribute("href", "/app/knowledge?topic=TRAFFIC");
    expect(within(menu).queryByRole("link", { name: /^Rankings/ })).not.toBeInTheDocument();
  });

  it("opens a story on its own page, and says when it has been taken down", () => {
    nav.pathname = "/app/news/item_update";
    const { unmount } = render(<NewsStoryPage />);

    expect(screen.getByRole("heading", { level: 1, name: /September 2026 spam update/ })).toBeInTheDocument();
    expect(screen.getByText("Wait for it to finish before changing pages.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /news\.story\.back/ })).toHaveAttribute("href", "/app/news");
    unmount();

    vi.mocked(useQuery).mockImplementation(answerQueries({ "news:getNewsItem": null, "learnMenu:getLearnMenuCounts": COUNTS }));
    render(<NewsStoryPage />);
    expect(screen.getAllByText("news.story.notFoundTitle").length).toBeGreaterThan(0);
  });
});
