import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { usePaginatedQuery, useQuery } from "convex/react";

import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import HelpfulContentPage from "../helpful-content/page";
import HelpfulArticlePage from "../helpful-content/[articleId]/page";
import KnowledgePage from "../knowledge/page";
import KnowledgeArticlePage from "../knowledge/[articleId]/page";
import WhoToFollowPage from "../who-to-follow/page";

/**
 * Insights' screens hold to the looks Anthony approved on the "Helpful content
 * in Insights" canvas, 2026-10-06 (docs/plans/active/insights-helpful-content-
 * plan.md; design-drift-plan D4): each, rendered with sample rows in English,
 * reads as the outline saved beside its board in
 * docs/plans/assets/insights-helpful-content/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/helpful-content", search: "", params: {} as Record<string, string> }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => nav.params,
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
// The app's top bar is the layout's, not the page's.
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "insights-helpful-content";
const day = (date: string) => Date.parse(`${date}T12:00:00Z`);

const helpful = (id: string, title: string, publication: string, date: string, topic = "RANKINGS") => ({
  _id: id, url: `https://${publication.toLowerCase().replace(/\s+/g, "")}.test/${id}`, title, publication, author: null, publishedOn: "2026-10-03",
  language: "en", topic, words: 4090, addedAt: day(date), summary: `${title}, summed up.`, meaning: "What it means for you.",
});
const HELPFUL = [
  helpful("helpful_1", "Quality at Google", "Nacho Mascort", "2026-10-05"),
  helpful("helpful_2", "AI features and your website", "Google Search Central", "2026-10-04", "AI_ANSWERS"),
  helpful("helpful_3", "A guide to Google Search ranking systems", "Google Search Central", "2026-10-02"),
  helpful("helpful_4", "Creating helpful, reliable, people-first content", "Google Search Central", "2026-10-02"),
  helpful("helpful_5", "Link building for SEO", "Ahrefs", "2026-09-29", "BACKLINKS"),
];
const knowledge = (id: string, title: string, date: string, topic = "TRAFFIC") => ({
  _id: id, title, excerpt: `${title}, in short.`, words: 460, topic, publishedAt: day(date), updatedAt: day(date),
});
const KNOWLEDGE = [
  knowledge("article_1", "How is traffic worked out?", "2026-10-01"),
  knowledge("article_2", "What does position mean?", "2026-09-28", "RANKINGS"),
  knowledge("article_3", "Why does an AI answer name some websites?", "2026-09-24", "AI_ANSWERS"),
  knowledge("article_4", "What makes a backlink worth having?", "2026-09-19", "BACKLINKS"),
  knowledge("article_5", "How often are your rankings checked?", "2026-09-15", "RANKINGS"),
];
const follow = (id: string, kind: string, name: string, pickedAt: number | null = null) => ({
  _id: id, kind, name, url: `https://${kind.toLowerCase()}.test/${id}`, why: `Why follow ${name}.`, topic: null, pickedAt,
});
const PEOPLE = [follow("f1", "YOUTUBE", "Ahrefs"), follow("f2", "LINKEDIN", "Aleyda Solis"), follow("f3", "X", "Barry Schwartz"), follow("f4", "WEBSITE", "Search Engine Land")];
const PICKS = [follow("p1", "WEBSITE", "Nacho Mascort", 1), follow("p2", "X", "Lily Ray", 2), follow("p3", "WEBSITE", "Kevin Indig", 3), follow("p4", "YOUTUBE", "Google Search Central", 4)];
const TOPICS = [{ key: "TRAFFIC", name: "Traffic" }, { key: "RANKINGS", name: "Rankings" }, { key: "AI_ANSWERS", name: "AI answers" }, { key: "BACKLINKS", name: "Backlinks" }];
const COUNTS = {
  news: { all: 2, GOOGLE_UPDATE: 0, WEBSITE: 0, YOUTUBE: 0, X: 0 },
  follows: 214,
  topics: TOPICS,
  articles: { all: 6, byTopic: { TRAFFIC: 2, RANKINGS: 2, AI_ANSWERS: 1, BACKLINKS: 1 } },
  helpful: { all: 8, byTopic: { TRAFFIC: 1, RANKINGS: 5, AI_ANSWERS: 1, BACKLINKS: 1 } },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T09:00:00"));
  nav.search = "";
  nav.params = {};
  vi.mocked(useQuery).mockReset().mockImplementation(answerQueries({
    "learnMenu:getLearnMenuCounts": COUNTS,
    "topics:listTopics": TOPICS,
    "knowledgeArticles:getPinnedForReaders": null,
    "libraryArticles:getPinnedForReaders": null,
    "libraryArticles:getReaderOverview": { all: 8, publications: [{ name: "Google Search Central", count: 4 }, { name: "Ahrefs", count: 1 }, { name: "Nacho Mascort", count: 1 }] },
    "libraryArticles:listForReadersSince": HELPFUL.slice(0, 4),
    "libraryArticles:getForReader": HELPFUL[0],
    "libraryArticles:listMoreForReaders": HELPFUL.slice(2, 4),
    "knowledgeArticles:getPublishedArticle": { ...KNOWLEDGE[0], body: "The traffic figure is our best estimate.\n\n## Where you rank matters most\n\nThe first result gets far more clicks." },
    "knowledgeArticles:listMoreForReaders": [KNOWLEDGE[1]],
    "newsFollows:listFollowsByPage": { rows: PEOPLE, total: 214, page: 1, pages: 9, size: 25, cut: null, preparing: false },
    "newsFollows:listPicks": PICKS,
    "newsFollows:getFollowTotals": { all: 214, byKind: { X: 90, YOUTUBE: 60, WEBSITE: 50, LINKEDIN: 14 }, byTopic: {}, byKindTopic: {} },
  }));
  vi.mocked(usePaginatedQuery).mockReset().mockImplementation(((query: unknown) => ({
    results: convexPath(query).startsWith("knowledgeArticles") ? KNOWLEDGE : HELPFUL,
    status: "CanLoadMore",
    isLoading: false,
    loadMore: vi.fn(),
  })) as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Insights' approved looks", () => {
  it("Helpful content", async () => {
    nav.pathname = "/app/helpful-content";
    const { container } = render(<HelpfulContentPage />);
    await screen.findByText("Link building for SEO");
    await expectApprovedLook(container, PLAN, "Main", "Insights → Helpful content");
  });

  it("Helpful content article", async () => {
    nav.pathname = "/app/helpful-content/helpful_1";
    nav.params = { articleId: "helpful_1" };
    const { container } = render(<HelpfulArticlePage />);
    await screen.findByText("A guide to Google Search ranking systems");
    await expectApprovedLook(container, PLAN, "Article", "Insights → Helpful content → an article");
  });

  it("Helpful content topic", async () => {
    nav.pathname = "/app/helpful-content";
    nav.search = "topic=RANKINGS";
    const { container } = render(<HelpfulContentPage />);
    await screen.findByText("Link building for SEO");
    await expectApprovedLook(container, PLAN, "Topic", "Insights → Helpful content → a topic");
  });

  it("Knowledge", async () => {
    nav.pathname = "/app/knowledge";
    const { container } = render(<KnowledgePage />);
    await screen.findByText("How is traffic worked out?");
    await expectApprovedLook(container, PLAN, "Knowledge", "Insights → Knowledge");
  });

  it("Knowledge article", async () => {
    nav.pathname = "/app/knowledge/article_1";
    nav.params = { articleId: "article_1" };
    const { container } = render(<KnowledgeArticlePage />);
    await screen.findByText("What does position mean?");
    await expectApprovedLook(container, PLAN, "KnowledgeArticle", "Insights → Knowledge → an article");
  });

  it("Who to follow", async () => {
    nav.pathname = "/app/who-to-follow";
    const { container } = render(<WhoToFollowPage />);
    await screen.findByText("Search Engine Land");
    await expectApprovedLook(container, PLAN, "WhoC", "Insights → Who to follow");
  });
});
