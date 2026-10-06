import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";

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
  status: "PUBLISHED", topic: "TRAFFIC", publishedAt: 1, leadUntil: null, updatedAt: Date.UTC(2026, 9, 1), translations: { done: 0, total: 1 },
};
const { pin, unpin } = vi.hoisted(() => ({ pin: vi.fn(), unpin: vi.fn() }));
const LEAD = { storyId: "helpful_1", title: "Quality at Google", place: "HELPFUL", pinned: true, leadUntil: Date.UTC(2026, 9, 13) };

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
    pin.mockReset().mockResolvedValue(null);
    unpin.mockReset().mockResolvedValue(null);
    vi.mocked(useQuery).mockImplementation(answerQueries({
      "knowledgeArticles:getArticle": ARTICLE,
      "news:getLeadForAdmin": LEAD,
      "topics:listTopicChoices": [{ key: "TRAFFIC", nameEn: "Traffic" }],
    }));
    // Searched and paged on the server (insights-helpful-content-plan.md, IH21).
    vi.mocked(usePaginatedQuery).mockReset().mockReturnValue({ results: [ARTICLE], status: "Exhausted", isLoading: false, loadMore: vi.fn() } as never);
    vi.mocked(useMutation).mockImplementation(((reference: unknown) => {
      const name = convexPath(reference);
      if (name.endsWith("unpinLeadStory")) return unpin;
      if (name.endsWith("pinLeadStory")) return pin;
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

    await waitFor(() => expect(update).toHaveBeenCalledWith({ articleId: "article_1", titleEn: ARTICLE.titleEn, bodyEn: "An estimate, worked out.", status: "PUBLISHED", topic: "TRAFFIC" }));
  });

  // One lead story, pinned from News, Knowledge or Helpful content (IH11, boards 11 and 12).
  it("says what leads the News front page and where it was pinned, and pins a published article from its row or its page", async () => {
    const { unmount } = renderWithProviders(<KnowledgeArticlesAdminPage />);

    expect(screen.getByText("admin.leadStory.pinned")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "admin.leadStory.pinRow" }));
    await waitFor(() => expect(pin).toHaveBeenCalledWith({ storyId: "article_1" }));
    unmount();

    renderWithProviders(<ArticleEditor articleId={"article_1" as never} />);
    expect(screen.getByText("admin.leadStory.pinned")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /admin\.leadStory\.pin$/ }));
    await waitFor(() => expect(pin).toHaveBeenCalledTimes(2));
  });

  it("shows where an article leads, offers to stop it, and never offers the pin on a draft", async () => {
    vi.mocked(usePaginatedQuery).mockReturnValue({
      results: [{ ...ARTICLE, leadUntil: Date.UTC(2026, 9, 13) }, { ...ARTICLE, _id: "article_2", titleEn: "Not yet", status: "DRAFT" }],
      status: "Exhausted",
      isLoading: false,
      loadMore: vi.fn(),
    } as never);
    renderWithProviders(<KnowledgeArticlesAdminPage />);

    const leading = screen.getByText("How is traffic worked out?").closest("tr") as HTMLElement;
    expect(within(leading).getByText("admin.leadStory.leadUntil")).toBeInTheDocument();
    fireEvent.click(within(leading).getByRole("button", { name: "admin.leadStory.unpin" }));
    await waitFor(() => expect(unpin).toHaveBeenCalledWith({ storyId: "article_1" }));
    const draft = screen.getByText("Not yet").closest("tr") as HTMLElement;
    expect(within(draft).queryByRole("button", { name: "admin.leadStory.pinRow" })).not.toBeInTheDocument();
  });
});
