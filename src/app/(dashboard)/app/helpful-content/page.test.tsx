import { fireEvent, renderWithProviders as render, screen, within } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import HelpfulContentPage from "./page";
import HelpfulArticlePage from "./[articleId]/page";

const nav = vi.hoisted(() => ({ locale: "en", search: "", pathname: "/app/helpful-content" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return { ...base, useLocale: () => nav.locale };
});
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ articleId: "helpful_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const day = (date: string) => Date.parse(`${date}T12:00:00Z`);
const helpful = (id: string, title: string, publication: string, date: string, topic: string | null = "RANKINGS") => ({
  _id: id, url: `https://${publication.toLowerCase().replace(/\s+/g, "")}.test/${id}`, title, publication, author: null, publishedOn: "2026-10-03",
  language: "en", topic, words: 4090, addedAt: day(date), summary: `${title}, summed up.`, meaning: id === "helpful_1" ? "Expect to wait for the next core update." : null,
});
const FEED = [
  helpful("helpful_1", "Quality at Google", "Nacho Mascort", "2026-10-05"),
  helpful("helpful_2", "AI features and your website", "Google Search Central", "2026-10-04", "AI_ANSWERS"),
  helpful("helpful_3", "A guide to Google Search ranking systems", "Google Search Central", "2026-10-02"),
  helpful("helpful_4", "Creating helpful, reliable, people-first content", "Google Search Central", "2026-10-02"),
  helpful("helpful_5", "Link building for SEO", "Ahrefs", "2026-09-29", "BACKLINKS"),
];
const TOPICS = [{ key: "TRAFFIC", name: "Traffic" }, { key: "RANKINGS", name: "Rankings" }, { key: "AI_ANSWERS", name: "AI answers" }, { key: "BACKLINKS", name: "Backlinks" }];
const COUNTS = {
  news: { all: 0, GOOGLE_UPDATE: 0, WEBSITE: 0, YOUTUBE: 0, X: 0 },
  follows: 0,
  topics: TOPICS,
  articles: { all: 0, byTopic: {} },
  helpful: { all: 8, byTopic: { RANKINGS: 5, AI_ANSWERS: 1, BACKLINKS: 1, TRAFFIC: 1 } },
};
const loadMore = vi.fn();

/**
 * Helpful content in Insights (docs/plans/active/insights-helpful-content-
 * plan.md, IH1, IH5–IH7): the best of what others have written, for every
 * signed-in user — Hakken's summary and what it means, never the article's
 * words — set out as News's front page and read from the server a page at a
 * time.
 */
describe("Helpful content", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T09:00:00"));
    nav.locale = "en";
    nav.search = "";
    loadMore.mockReset();
    vi.mocked(usePaginatedQuery).mockReset().mockReturnValue({ results: FEED, status: "CanLoadMore", isLoading: false, loadMore } as never);
    vi.mocked(useQuery).mockReset().mockImplementation(answerQueries({
      "learnMenu:getLearnMenuCounts": COUNTS,
      "topics:listTopics": TOPICS,
      "libraryArticles:getPinnedForReaders": null,
      "libraryArticles:getReaderOverview": { all: 8, publications: [{ name: "Google Search Central", count: 4 }, { name: "Ahrefs", count: 1 }] },
      "libraryArticles:listForReadersSince": FEED.slice(0, 4),
      "libraryArticles:getForReader": FEED[0],
      "libraryArticles:listMoreForReaders": [FEED[2], FEED[3]],
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("leads with the newest article — its summary, what it means, the original in a new tab — beside where they come from", () => {
    render(<HelpfulContentPage />);

    expect(screen.getByText("learn.helpful.weekCount")).toBeInTheDocument();
    const lead = screen.getByRole("region", { name: "learn.helpful.leadLabel" });
    expect(within(within(lead).getByRole("heading", { level: 2 })).getByRole("link", { name: "Quality at Google" })).toHaveAttribute("href", "/app/helpful-content/helpful_1");
    expect(within(lead).getByText("Quality at Google, summed up.")).toBeInTheDocument();
    expect(within(lead).getByText("Expect to wait for the next core update.")).toBeInTheDocument();
    const original = within(lead).getByRole("link", { name: /learn\.helpful\.readOn/ });
    expect(original).toHaveAttribute("href", FEED[0].url);
    expect(original).toHaveAttribute("target", "_blank");

    const publications = within(lead).getByRole("complementary", { name: "learn.helpful.publicationsTitle" });
    expect(within(publications).getByRole("link", { name: "Google Search Central" })).toHaveAttribute("href", "/app/helpful-content?publication=Google%20Search%20Central");
    expect(within(publications).getByRole("link", { name: /learn\.helpful\.whoToFollow/ })).toHaveAttribute("href", "/app/who-to-follow");

    const columns = within(screen.getByRole("region", { name: "learn.helpful.moreLabel" })).getAllByRole("article");
    expect(columns).toHaveLength(3);
    const earlier = screen.getByRole("region", { name: "learn.helpful.earlier" });
    expect(within(earlier).getByRole("link", { name: "Link building for SEO" })).toHaveAttribute("href", "/app/helpful-content/helpful_5");
    fireEvent.click(within(earlier).getByRole("button", { name: "news.front.showMore" }));
    expect(loadMore).toHaveBeenCalledWith(20);
  });

  it("leads with the article pinned to lead the News front page, and lists it once", () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "learnMenu:getLearnMenuCounts": COUNTS,
      "topics:listTopics": TOPICS,
      "libraryArticles:getPinnedForReaders": FEED[4],
      "libraryArticles:getReaderOverview": { all: 8, publications: [] },
      "libraryArticles:listForReadersSince": [],
    }));
    render(<HelpfulContentPage />);

    const lead = screen.getByRole("region", { name: "learn.helpful.leadLabel" });
    expect(within(lead).getByRole("heading", { level: 2 })).toHaveTextContent("Link building for SEO");
    expect(screen.getAllByRole("link", { name: "Link building for SEO" })).toHaveLength(1);
  });

  it("lists one topic, or one publication, alone through the server", () => {
    nav.search = "topic=RANKINGS";
    const { unmount } = render(<HelpfulContentPage />);
    expect(vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1]).toEqual({ language: "en", topic: "RANKINGS" });
    expect(screen.getByRole("heading", { level: 2, name: "Rankings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Rankings/ })).toHaveAttribute("aria-current", "page");
    unmount();

    nav.search = "publication=Ahrefs";
    render(<HelpfulContentPage />);
    expect(vi.mocked(usePaginatedQuery).mock.calls.at(-1)?.[1]).toEqual({ language: "en", publication: "Ahrefs" });
    expect(screen.getByRole("heading", { level: 2, name: "Ahrefs" })).toBeInTheDocument();
  });

  it("says so when nothing has been added", () => {
    vi.mocked(usePaginatedQuery).mockReturnValue({ results: [], status: "Exhausted", isLoading: false, loadMore } as never);
    render(<HelpfulContentPage />);

    expect(screen.getByText("learn.helpful.emptyTitle")).toBeInTheDocument();
  });

  it("opens an article on its own page, with more on its topic, and says when it is not here", () => {
    nav.pathname = "/app/helpful-content/helpful_1";
    const { unmount } = render(<HelpfulArticlePage />);

    expect(screen.getByRole("heading", { level: 1, name: /Quality at Google/ })).toBeInTheDocument();
    expect(screen.getByText("learn.helpful.length")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /learn\.helpful\.back/ })).toHaveAttribute("href", "/app/helpful-content");
    const more = screen.getByRole("region", { name: "learn.helpful.moreOn" });
    expect(within(more).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/app/helpful-content/helpful_3", "/app/helpful-content/helpful_4"]);
    unmount();

    vi.mocked(useQuery).mockImplementation(answerQueries({ "libraryArticles:getForReader": null, "learnMenu:getLearnMenuCounts": COUNTS }));
    render(<HelpfulArticlePage />);
    expect(screen.getAllByText("learn.helpful.notFoundTitle").length).toBeGreaterThan(0);
  });
});
