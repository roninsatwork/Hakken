import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { renderWithProviders } from "@/src/test/renderWithProviders";
import { answerQueries, convexPath } from "@/src/test/siteViewFixtures";
import KnowledgeArticlesAdminPage from "./page";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation({}));

const ARTICLE = {
  _id: "article_1", key: "traffic", titleEn: "How is traffic worked out?", bodyEn: "An estimate.",
  titleIt: "", bodyIt: "", status: "DRAFT", publishedAt: null, updatedAt: Date.UTC(2026, 9, 1),
};

/** Admin → Content → Knowledge (docs/plans/active/knowledge-news-and-digest-plan.md, phase 1). */
describe("Admin Knowledge articles", () => {
  beforeEach(() => {
    create.mockReset().mockResolvedValue("article_2");
    vi.mocked(useQuery).mockImplementation(answerQueries({ "knowledgeArticles:listArticles": [ARTICLE] }));
    vi.mocked(useMutation).mockImplementation(((reference: unknown) =>
      convexPath(reference).endsWith("createArticle") ? create : vi.fn()) as never);
  });

  it("lists every article with its status, and says when the Italian is missing", () => {
    renderWithProviders(<KnowledgeArticlesAdminPage />);

    expect(screen.getByText("How is traffic worked out?")).toBeInTheDocument();
    expect(screen.getByText("admin.knowledgeArticles.draft")).toBeInTheDocument();
    expect(screen.getByText("admin.knowledgeArticles.noItalian")).toBeInTheDocument();
  });

  it("opens an article in the editor with both languages", async () => {
    renderWithProviders(<KnowledgeArticlesAdminPage />);

    fireEvent.click(screen.getByRole("button", { name: "admin.knowledgeArticles.edit" }));
    expect(await screen.findByDisplayValue("How is traffic worked out?")).toBeInTheDocument();
    expect(screen.getByLabelText("admin.knowledgeArticles.bodyItLabel")).toBeInTheDocument();
  });

  it("writes a new article as a draft until it is published", async () => {
    renderWithProviders(<KnowledgeArticlesAdminPage />);

    fireEvent.click(screen.getByRole("button", { name: /admin\.knowledgeArticles\.create/ }));
    const title = await screen.findByLabelText(/admin\.knowledgeArticles\.titleEnLabel/);
    fireEvent.change(title, { target: { value: "Why rankings move" } });
    fireEvent.submit(title.closest("form") as HTMLFormElement);

    await waitFor(() => expect(create).toHaveBeenCalledWith({ titleEn: "Why rankings move", bodyEn: "", titleIt: "", bodyIt: "", status: "DRAFT" }));
  });
});
