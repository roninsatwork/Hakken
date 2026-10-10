import { cleanup, fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";

import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries } from "@/src/test/siteViewFixtures";
import KnowledgeAdminPage from "./page";
import { LibraryArticleEditor } from "./LibraryArticleEditor";

/**
 * Knowledge holds to the looks Anthony approved (design-drift-plan D4): its
 * one list and Add from a link on the "Content — people and knowledge" canvas,
 * 2026-10-10 (docs/plans/active/content-people-knowledge-plan.md, boards 5 and
 * 6), and a web article's own page on the "Content Library" canvas,
 * 2026-10-06 (content-library-plan.md, board 3), now opened from Knowledge.
 * Each screen, rendered with sample rows in English, reads as the outline
 * saved beside its board.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/content/knowledge",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "content-people-knowledge";
const LIBRARY_PLAN = "content-library";
const LIST_ROW = {
  _id: "list_1", kind: "WEB", articleId: "article_1", title: "Organic CTR study", came: "LINK", fromName: "Advanced Web Ranking", followId: null,
  topic: "TRAFFIC", words: 2140, status: "PUBLISHED", addedAt: 2, leadUntil: null, canLead: true, translations: { done: 1, total: 1 },
};
const LIST = {
  page: {
    rows: [LIST_ROW, { ...LIST_ROW, _id: "list_2", kind: "OURS", articleId: "ours_1", title: "How is traffic worked out?", came: "WRITTEN", fromName: "", status: "DRAFT", addedAt: 1 }],
    total: 2, page: 1, pages: 1, size: 15, cut: null, preparing: false,
  },
  counts: { published: 1, ours: 1, web: 1 },
  people: [],
};

const ROW = {
  _id: "article_1",
  url: "https://www.advancedwebranking.com/seo/organic-ctr",
  title: "Organic CTR study",
  publication: "Advanced Web Ranking",
  author: null,
  publishedOn: "2026-08-05",
  updatedOn: "2026-10-02",
  description: "How often people click each organic result on Google.",
  topic: "TRAFFIC",
  status: "IN_KNOWLEDGE",
  language: "en",
  words: 2140,
  readAt: Date.UTC(2026, 9, 6, 9, 14),
  summaryEn: "Most clicks go to the first organic result, and far fewer when an AI answer sits above it.",
  meaningEn: "A page-one position can still bring little traffic: check what sits above you.",
  createdAt: 2,
  updatedAt: 2,
};

beforeEach(() => {
  vi.mocked(useQuery).mockImplementation(answerQueries({
    "knowledgeList:listKnowledgeForAdmin": LIST,
    "libraryArticles:getArticle": { ...ROW, body: "# Organic CTR study\n\nHow often people click.", translations: { done: 1, total: 1 } },
    "topics:listTopicChoices": [{ key: "TRAFFIC", nameEn: "Traffic" }, { key: "RANKINGS", nameEn: "Rankings" }],
  }));
  vi.mocked(useMutation).mockImplementation((() => vi.fn()) as never);
  vi.mocked(useAction).mockImplementation((() => vi.fn(async () => ({
    status: "read",
    url: "https://developers.google.com/search/docs/appearance/ai-features",
    readAt: 5,
    title: "AI features and your website",
    publication: "Google Search Central",
    publishedOn: "2026-09-18",
    description: "How AI features work.",
    language: "en",
    body: "# AI features and your website\n\nWords.",
    words: 1180,
    cut: false,
  }))) as never);
});
afterEach(cleanup);

describe("Knowledge's approved looks", () => {
  it("Knowledge", async () => {
    const { container } = render(<KnowledgeAdminPage />);
    await screen.findByText("Organic CTR study");
    await expectApprovedLook(container, PLAN, "Knowledge", "Admin → Content → Knowledge");
  });

  it("Article", async () => {
    const { container } = render(<LibraryArticleEditor />);
    fireEvent.change(screen.getByLabelText(/Article address/), { target: { value: "https://developers.google.com/search/docs/appearance/ai-features" } });
    fireEvent.click(screen.getByRole("button", { name: /Read the page/ }));
    await screen.findByDisplayValue("AI features and your website");
    await expectApprovedLook(container, PLAN, "Article", "Admin → Content → Knowledge → Add from a link, once its page is read");
  });

  it("a web article's own page", async () => {
    const { container } = render(<LibraryArticleEditor articleId={"article_1" as never} />);
    await screen.findByDisplayValue("Organic CTR study");
    await expectApprovedLook(container, LIBRARY_PLAN, "Article", "Admin → Content → Knowledge → an article from the web");
  });
});
