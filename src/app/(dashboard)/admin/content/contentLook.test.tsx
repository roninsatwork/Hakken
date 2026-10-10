import { cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries } from "@/src/test/siteViewFixtures";
import WhoToFollowAdminPage from "./who-to-follow/page";
import { PersonPage } from "./who-to-follow/PersonPage";
import { AddPersonPage } from "./who-to-follow/AddPersonPage";
import NewsItemsAdminPage from "./news/page";
import AnalyticsOverviewPage from "./analytics/page";
import AnalyticsArticlesPage from "./analytics/articles/page";
import AnalyticsArticlePage from "./analytics/articles/[itemKey]/page";
import AnalyticsPeoplePage from "./analytics/people/page";
import AnalyticsCompaniesPage from "./analytics/companies/page";
import AnalyticsCompanyPage from "./analytics/companies/[companyId]/page";

/**
 * Admin → Content holds to the looks Anthony approved on the "Content —
 * people and knowledge" canvas, 2026-10-10 (docs/plans/active/content-people-
 * knowledge-plan.md, boards 1–4 and 7–12; design-drift-plan D4): each screen,
 * rendered with sample rows in English, reads as the outline saved beside its
 * board in docs/plans/assets/content-people-knowledge/look/. Knowledge and Add
 * from a link (boards 5, 6) are held by `knowledge/knowledgeLook.test.tsx`.
 */

const { nav } = vi.hoisted(() => ({ nav: { params: {} as Record<string, string> } }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/content",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => nav.params,
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "content-people-knowledge";
const TOPICS = [{ key: "RANKINGS", nameEn: "Rankings" }, { key: "TRAFFIC", nameEn: "Traffic" }];
const NONE = { state: null, words: null, problem: null };
const GLENN = {
  _id: "glenn", name: "Glenn Gabe", whyEn: "Core updates, explained.", channelKinds: ["WEBSITE", "X"], topic: "RANKINGS", pickedAt: 1,
  collected: 8, inKnowledge: 3, newestAt: Date.UTC(2026, 9, 7), createdAt: 1, translations: { done: 1, total: 1 },
};
const RANGE = { from: "2026-09-10", to: "2026-10-09", days: 30 };
const DAYS = [{ day: "2026-10-08", views: 120, reads: 40, clicks: 9, answers: 2 }];
const ITEM = {
  itemKey: "WEB:article_1", title: "What the October core update changed", fromName: "Glenn Gabe", source: "PERSON", where: "KNOWLEDGE", topic: "RANKINGS",
  views: 412, reads: 188, clicks: 61, answers: 23, readRate: 46,
};
const page = (rows: unknown[]) => ({ rows, total: rows.length, page: 1, pages: 1, size: 15, cut: null, preparing: false });

beforeEach(() => {
  nav.params = {};
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "topics:listTopicChoices": TOPICS,
    "newsFollows:listFollowsForAdmin": page([GLENN]),
    "newsFollows:listPicksForAdmin": [{ _id: "glenn", name: "Glenn Gabe" }],
    "newsFollows:getFollow": GLENN,
    "newsFollows:listFollowNamesForAdmin": [{ _id: "glenn", name: "Glenn Gabe" }],
    "followChannels:listChannelsForAdmin": [
      { _id: "c_site", kind: "WEBSITE", address: "https://gsqi.com/marketing-blog", collect: true, status: "COLLECTING", problem: null, lastCheckedAt: 1, lastItemAt: 1, found: 8 },
    ],
    "xConnect:xConnectionStatus": null,
    "news:countNewsInKnowledgeForAdmin": { count: 1, more: false },
    "news:getLeadForAdmin": null,
    "readingAnalytics:analyticsOverview": {
      range: RANGE,
      figures: { views: 3068, reads: 1117, clicks: 340, answers: 40, viewsBefore: 2600, readers: 146, companies: 31 },
      days: DAYS,
      counts: { articles: 64, people: 6, companies: 31 },
      top: { articles: [ITEM], people: [], companies: [], users: [] },
    },
    "readingAnalytics:analyticsArticles": { range: RANGE, page: { ...page([{ ...ITEM, trend: [] }]) }, days: DAYS, daysCut: false, people: [] },
    "readingAnalytics:analyticsArticle": {
      range: RANGE,
      item: { title: ITEM.title, fromName: "Glenn Gabe", where: "KNOWLEDGE", topic: "RANKINGS", url: "https://gsqi.com/october", publishedAt: 1, keptAt: 2 },
      figures: { views: 108, reads: 47, clicks: 16, answers: 8, viewsBefore: 90 },
      days: DAYS,
      companies: [{ companyId: "korda", name: "Korda", readers: 4, views: 31, reads: 14, clicks: 5, lastAt: 1 }],
      readers: 13,
    },
    "readingAnalytics:analyticsPeople": {
      range: RANGE,
      page: page([{ followId: "glenn", name: "Glenn Gabe", topic: "RANKINGS", picked: true, articles: 8, views: 653, reads: 278, clicks: 94, answers: 31, readRate: 43, trend: [] }]),
    },
    "readingAnalytics:analyticsCompanies": {
      range: RANGE,
      days: [{ day: "2026-10-08", readers: 12, companies: 5 }],
      readers: 146,
      page: page([{ companyId: "korda", name: "Korda", readers: 9, views: 412, reads: 158, clicks: 47, lastAt: 1 }]),
    },
    "readingAnalytics:analyticsCompany": {
      range: RANGE,
      name: "Korda",
      lastAt: 1,
      figures: { views: 412, reads: 158, clicks: 47, answers: 0, viewsBefore: 338, readers: 9, people: 14 },
      days: DAYS,
      people: [{ userId: "james", name: "James Okafor", views: 88, reads: 35, clicks: 10, topMost: "RANKINGS", lastAt: 1 }],
    },
  }));
  vi.mocked(usePaginatedQuery).mockReturnValue({
    results: [{
      _id: "story_1", kind: "WEBSITE", sourceName: "Glenn Gabe", followId: "glenn", titleEn: "What the October core update changed", summaryEn: "Which kinds of sites gained and lost.",
      url: "https://gsqi.com/october", knowledge: { state: "IN", words: 3412, problem: null }, publishedAt: 1, createdAt: 1, isGoogleUpdate: false, leadUntil: null,
    }],
    status: "Exhausted",
    isLoading: false,
    loadMore: vi.fn(),
  } as never);
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
});
afterEach(cleanup);

describe("Content's approved looks", () => {
  it("Main — Who to follow", async () => {
    const { container } = render(<WhoToFollowAdminPage />);
    await screen.findByText("Glenn Gabe");
    await expectApprovedLook(container, PLAN, "Main", "Admin → Content → Who to follow");
  });

  it("Person — a person and their channels", async () => {
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: [{ _id: "story_1", kind: "WEBSITE", titleEn: "What the October core update changed", summaryEn: "Which kinds of sites.", url: "https://gsqi.com/october", publishedAt: 1, knowledge: NONE }],
      status: "Exhausted", isLoading: false, loadMore: vi.fn(),
    } as never);
    const { container } = render(<PersonPage followId={"glenn" as never} />);
    await screen.findByText("gsqi.com/marketing-blog");
    await expectApprovedLook(container, PLAN, "Person", "Admin → Content → Who to follow → a person");
  });

  it("AddPerson — Add a person", async () => {
    const { container } = render(<AddPersonPage />);
    await screen.findByLabelText(/Their channels|channels/i);
    await expectApprovedLook(container, PLAN, "AddPerson", "Admin → Content → Who to follow → Add a person");
  });

  it("News — every story with its In knowledge tick", async () => {
    const { container } = render(<NewsItemsAdminPage />);
    await screen.findByText("What the October core update changed");
    await expectApprovedLook(container, PLAN, "News", "Admin → Content → News");
  });

  it("AnalyticsOverview", async () => {
    const { container } = render(<AnalyticsOverviewPage />);
    await screen.findByText("3,068");
    await expectApprovedLook(container, PLAN, "AnalyticsOverview", "Admin → Content → Analytics → Overview");
  });

  it("AnalyticsArticles", async () => {
    const { container } = render(<AnalyticsArticlesPage />);
    await screen.findByText(ITEM.title);
    await expectApprovedLook(container, PLAN, "AnalyticsArticles", "Admin → Content → Analytics → Articles");
  });

  it("AnalyticsArticle", async () => {
    nav.params = { itemKey: "WEB%3Aarticle_1" };
    const { container } = render(<AnalyticsArticlePage />);
    await screen.findByText("Korda");
    await expectApprovedLook(container, PLAN, "AnalyticsArticle", "Admin → Content → Analytics → an article");
  });

  it("AnalyticsPeople", async () => {
    const { container } = render(<AnalyticsPeoplePage />);
    await screen.findByText("Glenn Gabe");
    await expectApprovedLook(container, PLAN, "AnalyticsPeople", "Admin → Content → Analytics → People");
  });

  it("AnalyticsReaders — Companies", async () => {
    const { container } = render(<AnalyticsCompaniesPage />);
    await screen.findByText("Korda");
    await expectApprovedLook(container, PLAN, "AnalyticsReaders", "Admin → Content → Analytics → Companies");
  });

  it("AnalyticsCompany", async () => {
    nav.params = { companyId: "korda" };
    const { container } = render(<AnalyticsCompanyPage />);
    await screen.findByText("James Okafor");
    await expectApprovedLook(container, PLAN, "AnalyticsCompany", "Admin → Content → Analytics → a company");
  });
});
