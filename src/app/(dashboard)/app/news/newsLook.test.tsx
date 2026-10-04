import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import { expectApprovedLook } from "@/src/test/lookOutline";
import NewsPage from "./page";

/**
 * News's front page holds to the look Anthony approved on 2026-10-01 ("this
 * is really strong can we build this please"; knowledge-news-and-digest-plan
 * R5, design-drift-plan D4): rendered with sample stories in English, it reads
 * as the outline saved in docs/plans/assets/knowledge-news-and-digest/look/.
 */

const nav = vi.hoisted(() => ({ pathname: "/app/news", search: "" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
// The app's top bar is the layout's, not the page's.
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "knowledge-news-and-digest";

const at = (day: string) => Date.parse(`${day}T12:00:00Z`);

const LEAD = {
  _id: "item_update", kind: "GOOGLE_UPDATE", sourceName: "Google Search Central", title: "September 2026 spam update",
  summary: "Google is rolling out a spam update.", meaning: "Wait for it to finish before changing pages.",
  url: "https://status.search.google.test/2", publishedAt: at("2026-09-24"),
  update: { startedOn: "2026-09-24", finishedOn: null, expectedDays: 14 },
};
const story = (id: string, title: string, day: string, kind: string) => ({
  _id: id, kind, sourceName: "Search news", title, summary: `${title}, in short.`, meaning: "", url: `https://news.test/${id}`, publishedAt: at(day), update: null,
});
const FEED = [
  LEAD,
  story("item_1", "Search Console shows AI clicks", "2026-09-30", "WEBSITE"),
  story("item_2", "Why AI Overviews quote first lines", "2026-09-29", "YOUTUBE"),
  story("item_3", "First drops from the spam update", "2026-09-28", "X"),
  story("item_4", "A complete Business Profile", "2026-09-27", "YOUTUBE"),
  story("item_5", "What makes a page worth citing", "2026-09-27", "WEBSITE"),
];
const ARTICLE = { _id: "article_1", title: "How is traffic worked out?", excerpt: "Traffic is an estimate.", topic: "TRAFFIC", publishedAt: at("2026-09-30"), updatedAt: at("2026-09-30") };
const UPDATES = [
  { _id: "update_1", title: "September 2026 spam update", itemId: "item_update", startedOn: "2026-09-24", finishedOn: null, expectedDays: 14 },
  { _id: "update_2", title: "August 2026 core update", itemId: null, startedOn: "2026-08-19", finishedOn: "2026-09-04", expectedDays: 14 },
  { _id: "update_3", title: "June 2026 core update", itemId: null, startedOn: "2026-06-30", finishedOn: "2026-07-17", expectedDays: 14 },
];
const COUNTS = {
  news: { all: 24, GOOGLE_UPDATE: 3, WEBSITE: 5, YOUTUBE: 9, X: 7 },
  follows: 6,
  articles: { all: 11, TRAFFIC: 3, RANKINGS: 4, AI_ANSWERS: 2, BACKLINKS: 2 },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T09:00:00"));
  vi.mocked(useQuery).mockReset().mockImplementation(answerQueries({
    "news:getFrontPage": { lead: LEAD, weekCount: 24 },
    "googleUpdates:listLatestGoogleUpdates": UPDATES,
    "knowledgeArticles:listPublishedArticles": [ARTICLE],
    "learnMenu:getLearnMenuCounts": COUNTS,
  }));
  // More stories than one read, so "Show more" is on the page.
  vi.mocked(usePaginatedQuery).mockReset().mockReturnValue({ results: FEED, status: "CanLoadMore", isLoading: false, loadMore: vi.fn() } as never);
  vi.mocked(useMutation).mockReset().mockImplementation((() => vi.fn(async () => null)) as never);
  vi.mocked(useAction).mockReset().mockImplementation((() => vi.fn(() => new Promise(() => undefined))) as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("News's approved look", () => {
  it("News front page", async () => {
    const { container } = render(<NewsPage />);
    await screen.findByText("First drops from the spam update");
    await expectApprovedLook(container, PLAN, "NewsFrontPage", "Learn → News");
  });
});
