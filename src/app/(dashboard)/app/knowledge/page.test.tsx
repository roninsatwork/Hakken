import { fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import KnowledgePage from "./page";
import KnowledgeArticlePage from "./[articleId]/page";

const nav = vi.hoisted(() => ({ locale: "en", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return { ...base, useLocale: () => nav.locale };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/knowledge",
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ articleId: "article_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const day = (date: string) => Date.parse(`${date}T12:00:00Z`);
const article = (id: string, title: string, date: string, topic: string | null = "TRAFFIC") => ({
  _id: id, title, excerpt: `${title}, in short.`, words: 460, topic, publishedAt: day(date), updatedAt: day(date),
});
const FEED = [
  article("article_1", "How is traffic worked out?", "2026-10-01"),
  article("article_2", "What does position mean?", "2026-09-28", "RANKINGS"),
  article("article_3", "Why does an AI answer name some websites?", "2026-09-24", "AI_ANSWERS"),
  article("article_4", "What makes a backlink worth having?", "2026-09-19", "BACKLINKS"),
  article("article_5", "How often are your rankings checked?", "2026-09-15", "RANKINGS"),
];
const TOPICS = [{ key: "TRAFFIC", name: "Traffic" }, { key: "RANKINGS", name: "Rankings" }, { key: "AI_ANSWERS", name: "AI answers" }, { key: "BACKLINKS", name: "Backlinks" }];
const COUNTS = {
  news: { all: 0, GOOGLE_UPDATE: 0, WEBSITE: 0, YOUTUBE: 0, X: 0 },
  follows: 0,
  topics: TOPICS,
  articles: { all: 6, byTopic: { TRAFFIC: 2, RANKINGS: 2, AI_ANSWERS: 1 } },
  helpful: { all: 0, byTopic: {} },
};
const HELPFUL = {
  _id: "helpful_1", url: "https://developers.google.com/search/docs/fundamentals/how-search-works", title: "How Google Search works", publication: "Google Search Central",
  author: null, publishedOn: null, language: "en", topic: "TRAFFIC", words: 1200, addedAt: day("2026-09-25"), summary: "Crawling, indexing and serving.", meaning: null,
};
const loadMore = vi.fn();

/**
 * Knowledge (docs/plans/active/knowledge-news-and-digest-plan.md, phase 1;
 * redrawn by insights-helpful-content-plan.md, IH12): every signed-in user's,
 * in their language, set out as News's front page, read from the server a page
 * at a time.
 */
describe("Knowledge", () => {
  beforeEach(() => {
    nav.locale = "en";
    nav.search = "";
    loadMore.mockReset();
    vi.mocked(usePaginatedQuery).mockReset().mockReturnValue({ results: FEED, status: "CanLoadMore", isLoading: false, loadMore } as never);
    vi.mocked(useQuery).mockReset().mockImplementation(answerQueries({
      "learnMenu:getLearnMenuCounts": COUNTS,
      "topics:listTopics": TOPICS,
      "knowledgeArticles:getPinnedForReaders": null,
      "knowledgeArticles:getPublishedArticle": { ...FEED[0], body: "It is an **estimate**, not a count." },
      "knowledgeArticles:listMoreForReaders": [FEED[1]],
      "libraryArticles:listMoreForReaders": [HELPFUL],
    }));
  });

  it("leads with the newest article, what Knowledge covers beside it, three in columns and the rest one to a line", () => {
    render(<KnowledgePage />);

    const lead = screen.getByRole("region", { name: "knowledgeArticles.front.leadLabel" });
    expect(within(within(lead).getByRole("heading", { level: 2 })).getByRole("link", { name: "How is traffic worked out?" })).toHaveAttribute("href", "/app/knowledge/article_1");
    expect(within(lead).getByRole("link", { name: /knowledgeArticles\.front\.readArticle/ })).toHaveAttribute("href", "/app/knowledge/article_1");
    expect(within(lead).getByRole("link", { name: "news.story.askHakken" }).getAttribute("href")).toMatch(/^\/app\/assistant\?ask=/);

    // Its topics, with their counts, each one link; a topic without articles is left out.
    const topics = within(lead).getByRole("complementary", { name: "knowledgeArticles.front.topicsTitle" });
    expect(within(topics).getByRole("link", { name: "Traffic" })).toHaveAttribute("href", "/app/knowledge?topic=TRAFFIC");
    expect(within(topics).queryByRole("link", { name: "Backlinks" })).not.toBeInTheDocument();
    expect(within(topics).getByRole("link", { name: /knowledgeArticles\.front\.helpfulContent/ })).toHaveAttribute("href", "/app/helpful-content");

    const columns = within(screen.getByRole("region", { name: "knowledgeArticles.front.moreLabel" })).getAllByRole("article");
    expect(columns.map((column) => within(column).getByRole("heading").textContent)).toEqual([
      "What does position mean?",
      "Why does an AI answer name some websites?",
      "What makes a backlink worth having?",
    ]);
    const earlier = screen.getByRole("region", { name: "knowledgeArticles.front.earlier" });
    expect(within(earlier).getByRole("link", { name: "How often are your rankings checked?" })).toHaveAttribute("href", "/app/knowledge/article_5");
    fireEvent.click(within(earlier).getByRole("button", { name: "news.front.showMore" }));
    expect(loadMore).toHaveBeenCalledWith(20);
  });

  it("leads with the article pinned to lead the News front page, and lists it once", () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "learnMenu:getLearnMenuCounts": COUNTS,
      "topics:listTopics": TOPICS,
      "knowledgeArticles:getPinnedForReaders": FEED[3],
    }));
    render(<KnowledgePage />);

    const lead = screen.getByRole("region", { name: "knowledgeArticles.front.leadLabel" });
    expect(within(lead).getByRole("heading", { level: 2 })).toHaveTextContent("What makes a backlink worth having?");
    expect(screen.getAllByRole("link", { name: "What makes a backlink worth having?" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "How is traffic worked out?" })).toHaveLength(1);
  });

  it("asks the server for the reader's language", () => {
    nav.locale = "it";
    render(<KnowledgePage />);

    expect(vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1]).toEqual({ language: "it" });
  });

  // Insights' side menu lists Knowledge by topic (R9), from the shared topic list in its readers' words (IH20).
  it("lists one topic's articles alone, through the server, when the side menu asks for it", () => {
    nav.search = "topic=TRAFFIC";
    render(<KnowledgePage />);

    expect(vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1]).toEqual({ language: "en", topic: "TRAFFIC" });
    expect(screen.getByRole("heading", { level: 2, name: "Traffic" })).toBeInTheDocument();
    expect(screen.getByText("How is traffic worked out?, in short.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "knowledgeArticles.front.leadLabel" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Traffic/ })).toHaveAttribute("aria-current", "page");
  });

  it("says so when nothing is published yet", () => {
    vi.mocked(usePaginatedQuery).mockReturnValue({ results: [], status: "Exhausted", isLoading: false, loadMore } as never);
    render(<KnowledgePage />);

    expect(screen.getByText("knowledgeArticles.front.emptyTitle")).toBeInTheDocument();
  });

  it("shows an article's words and facts, Ask Hakken, and Keep reading — Knowledge and Helpful content together", () => {
    render(<KnowledgeArticlePage />);

    expect(screen.getByRole("heading", { level: 1, name: /How is traffic worked out\?/ })).toBeInTheDocument();
    expect(screen.getByText("estimate")).toBeInTheDocument();
    expect(screen.getByText("knowledgeArticles.article.readingTime")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /knowledgeArticles\.article\.back/ })).toHaveAttribute("href", "/app/knowledge");

    const keepReading = screen.getByRole("region", { name: "knowledgeArticles.article.keepReading" });
    expect(within(keepReading).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/app/knowledge/article_2", "/app/helpful-content/helpful_1"]);
    // Its topic, not another's, and never the article being read.
    expect(vi.mocked(useQuery).mock.calls.some(([, args]) => (args as { exclude?: string; topic?: string })?.exclude === "article_1" && (args as { topic?: string }).topic === "TRAFFIC")).toBe(true);
    // Its topic is lit in the side menu.
    expect(screen.getByRole("link", { name: /^Traffic/ })).toHaveAttribute("aria-current", "page");
  });

  it("says a draft or a taken-down article is not here", () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "knowledgeArticles:getPublishedArticle": null, "learnMenu:getLearnMenuCounts": COUNTS }));
    render(<KnowledgeArticlePage />);

    expect(screen.getAllByText("knowledgeArticles.article.notFoundTitle").length).toBeGreaterThan(0);
  });
});
