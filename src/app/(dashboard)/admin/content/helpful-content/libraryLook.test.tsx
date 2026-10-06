import { cleanup, fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { expectApprovedLook } from "@/src/test/lookOutline";
import { answerQueries } from "@/src/test/siteViewFixtures";
import LibraryAdminPage from "./page";
import { LibraryArticleEditor } from "./LibraryArticleEditor";

/**
 * The Library holds to the looks Anthony approved on the "Content Library"
 * canvas, 2026-10-06 (docs/plans/active/content-library-plan.md;
 * design-drift-plan D4): each screen, rendered with sample rows in English,
 * reads as the outline saved beside its board in
 * docs/plans/assets/content-library/look/.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/content/helpful-content",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));

const PLAN = "content-library";

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
    "libraryArticles:listAdminPublications": ["Advanced Web Ranking", "Google Search Central"],
    "libraryArticles:getArticle": { ...ROW, body: "# Organic CTR study\n\nHow often people click.", translations: { done: 1, total: 1 } },
    "topics:listTopicChoices": [{ key: "TRAFFIC", nameEn: "Traffic" }, { key: "RANKINGS", nameEn: "Rankings" }],
  }));
  vi.mocked(usePaginatedQuery).mockReturnValue({
    results: [ROW, { ...ROW, _id: "article_2", title: "How Google Search works", publication: "Google Search Central", status: "DRAFT", createdAt: 1 }],
    status: "Exhausted",
    isLoading: false,
    loadMore: vi.fn(),
  } as never);
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

describe("Helpful content's approved looks (was the Library)", () => {
  it("Library", async () => {
    const { container } = render(<LibraryAdminPage />);
    await screen.findByText("Organic CTR study");
    await expectApprovedLook(container, PLAN, "Library", "Admin → Content → Helpful content");
  });

  it("AddArticle", async () => {
    const { container } = render(<LibraryArticleEditor />);
    fireEvent.change(screen.getByLabelText(/Article address/), { target: { value: "https://developers.google.com/search/docs/appearance/ai-features" } });
    fireEvent.click(screen.getByRole("button", { name: /Read the page/ }));
    await screen.findByDisplayValue("AI features and your website");
    await expectApprovedLook(container, PLAN, "AddArticle", "Admin → Content → Helpful content → Add an article, once its page is read");
  });

  it("Article", async () => {
    const { container } = render(<LibraryArticleEditor articleId={"article_1" as never} />);
    await screen.findByDisplayValue("Organic CTR study");
    await expectApprovedLook(container, PLAN, "Article", "Admin → Content → Helpful content → an article");
  });
});
