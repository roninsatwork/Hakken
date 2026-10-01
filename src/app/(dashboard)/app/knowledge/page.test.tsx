import { fireEvent, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import { answerQueries } from "@/src/test/siteViewFixtures";
import KnowledgePage from "./page";
import KnowledgeArticlePage from "./[articleId]/page";

const nav = vi.hoisted(() => ({ push: vi.fn(), locale: "en" }));

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  return { ...base, useLocale: () => nav.locale };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/knowledge",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ articleId: "article_1" }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/ui/components/layout/Header", () => ({ default: () => null }));

const TRAFFIC = { _id: "article_1", titleEn: "How is traffic worked out?", titleIt: "Come viene calcolato il traffico?", publishedAt: 1, updatedAt: Date.UTC(2026, 9, 1) };
const RANKINGS = { _id: "article_2", titleEn: "Why rankings move", titleIt: "Perché le posizioni cambiano", publishedAt: 2, updatedAt: Date.UTC(2026, 9, 1) };

/** Knowledge (docs/plans/active/knowledge-news-and-digest-plan.md, phase 1): every signed-in user's, in their language. */
describe("Knowledge", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReset();
    nav.push.mockReset();
    nav.locale = "en";
  });

  it("lists the published articles and opens one on its own screen", () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "knowledgeArticles:listPublishedArticles": [TRAFFIC, RANKINGS] }));
    render(<KnowledgePage />);

    expect(screen.getByText("How is traffic worked out?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Why rankings move"));
    expect(nav.push).toHaveBeenCalledWith("/app/knowledge/article_2");
  });

  it("finds an article by its title, in Italian for an Italian reader", () => {
    nav.locale = "it";
    vi.mocked(useQuery).mockImplementation(answerQueries({ "knowledgeArticles:listPublishedArticles": [TRAFFIC, RANKINGS] }));
    render(<KnowledgePage />);

    fireEvent.change(screen.getByPlaceholderText("knowledgeArticles.list.searchPlaceholder"), { target: { value: "traffico" } });
    expect(screen.getByText("Come viene calcolato il traffico?")).toBeInTheDocument();
    expect(screen.queryByText("Perché le posizioni cambiano")).not.toBeInTheDocument();
  });

  it("shows an article's words, with the way back to Knowledge", () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "knowledgeArticles:getPublishedArticle": { ...TRAFFIC, bodyEn: "It is an **estimate**, not a count.", bodyIt: "È una stima." },
    }));
    render(<KnowledgeArticlePage />);

    expect(screen.getByRole("heading", { name: /How is traffic worked out\?/ })).toBeInTheDocument();
    expect(screen.getByText("estimate")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /knowledgeArticles\.article\.back/ })).toHaveAttribute("href", "/app/knowledge");
  });

  it("says a draft or a taken-down article is not here", () => {
    vi.mocked(useQuery).mockImplementation(answerQueries({ "knowledgeArticles:getPublishedArticle": null }));
    render(<KnowledgeArticlePage />);

    expect(screen.getAllByText("knowledgeArticles.article.notFoundTitle").length).toBeGreaterThan(0);
  });
});
