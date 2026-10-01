import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import KnowledgeArticlesAdminPage from "./page";
import { ArticleEditor } from "./ArticleEditor";

const { create, update, push } = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), push: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => ({
  ...(await import("@/src/test/screenMocks")).nextNavigation({}),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const ARTICLE = {
  _id: "article_1", key: "traffic", titleEn: "How is traffic worked out?", bodyEn: "An estimate.",
  status: "PUBLISHED", publishedAt: 1, updatedAt: Date.UTC(2026, 9, 1), translations: { done: 0, total: 1 },
};

/**
 * Admin → Content → Knowledge (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 1, revised 2026-10-01): written in English on its own page, never in a
 * pop-up, and translated by the Translator.
 */
describe("Admin Knowledge articles", () => {
  beforeEach(() => {
    push.mockReset();
    create.mockReset().mockResolvedValue("article_2");
    update.mockReset().mockResolvedValue(null);
    vi.mocked(useQuery).mockImplementation(answerQueries({ "knowledgeArticles:listArticles": [ARTICLE], "knowledgeArticles:getArticle": ARTICLE }));
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      return name.endsWith("createArticle") ? create : name.endsWith("updateArticle") ? update : vi.fn();
    }) as never);
  });

  it("lists every article with its status and how far its translations have got, each opening on its own page", () => {
    renderWithProviders(<KnowledgeArticlesAdminPage />);

    expect(screen.getByText("How is traffic worked out?")).toBeInTheDocument();
    expect(screen.getByText("admin.knowledgeArticles.published")).toBeInTheDocument();
    expect(screen.getByText("admin.contentEditor.translations.waiting")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "admin.knowledgeArticles.edit" }));
    expect(push).toHaveBeenCalledWith("/admin/content/knowledge/article_1");
    fireEvent.click(screen.getByRole("button", { name: /admin\.knowledgeArticles\.create/ }));
    expect(push).toHaveBeenCalledWith("/admin/content/knowledge/new");
  });

  it("writes a new article in English alone, as a draft, and goes back to the list", async () => {
    renderWithProviders(<ArticleEditor />);

    expect(screen.queryByText(/Italian|bodyItLabel|titleItLabel/)).not.toBeInTheDocument();
    const title = screen.getByLabelText(/admin\.knowledgeArticles\.titleLabel/);
    fireEvent.change(title, { target: { value: "Why rankings move" } });
    fireEvent.submit(title.closest("form") as HTMLFormElement);

    await waitFor(() => expect(create).toHaveBeenCalledWith({ titleEn: "Why rankings move", bodyEn: "", status: "DRAFT" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/content/knowledge"));
  });

  it("opens an article with its words and translation status, and saves a change", async () => {
    renderWithProviders(<ArticleEditor articleId={"article_1" as never} />);

    const body = screen.getByDisplayValue("An estimate.");
    expect(screen.getByText("admin.contentEditor.translations.waiting")).toBeInTheDocument();
    fireEvent.change(body, { target: { value: "An estimate, worked out." } });
    fireEvent.submit(body.closest("form") as HTMLFormElement);

    await waitFor(() => expect(update).toHaveBeenCalledWith({ articleId: "article_1", titleEn: ARTICLE.titleEn, bodyEn: "An estimate, worked out.", status: "PUBLISHED" }));
  });
});
